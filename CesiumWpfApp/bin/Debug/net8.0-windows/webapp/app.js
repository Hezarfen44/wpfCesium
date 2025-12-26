//***********************************************************************************
// SINIF: DEMTerrainProvider
// AMAÇ: GeoServer gibi bir WMS (Web Map Service) kaynağından alınan ve RGB renk kodlaması
// ile yükseklik bilgisi içeren görüntüleri, CesiumJS için 3D arazi verisine dönüştürür.
// Bu sınıf, Cesium'un TerrainProvider arayüzünü uygular ve çok sayıda performans
// optimizasyonu içerir (Worker kullanımı, istek kuyruğu, dinamik LOD vb.).
//***********************************************************************************
class DEMTerrainProvider {
    /**
     * @param {object} options - Yapılandırma seçenekleri.
     * @param {string} options.url - WMS servisinin temel URL'si.
     * @param {string} options.layerName - Yükseklik verisini içeren katmanın adı.
     * @param {number} [options.tileSize=128] - Her bir arazi parçasının piksel boyutu.
     * @param {number} [options.maximumLevel=12] - İzin verilen maksimum detay (zoom) seviyesi. Performans için düşürüldü.
     * @param {number} [options.scale=0.1] - RGB değerini metreye çevirirken kullanılacak ölçek faktörü.
     * @param {number} [options.offset=-10000] - RGB değerini metreye çevirirken kullanılacak ofset değeri.
     */
    constructor(options) {
        this.url = options.url;
        this.layerName = options.layerName;
        this.tileSize = options.tileSize || 128;
        this.maximumLevel = options.maximumLevel || 12; // Performans için 18'den 12'ye düşürüldü
        this.minimumLevel = options.minimumLevel || 0;
        this.format = options.format || "image/png";
        this.noDataValue = options.noDataValue || -9999;
        this.minHeight = options.minHeight || -1000;
        this.maxHeight = options.maxHeight || 9000;
        // Yükseklik verisi formülü: height = (encodedValue * scale) + offset
        this.scale = options.scale !== undefined ? options.scale : 0.1;
        this.offset = options.offset !== undefined ? options.offset : -10000;

        // --- Performans ve İstek Yönetimi Ayarları (Agresif) ---
        this.targetFps = 30; // Hedeflenen minimum FPS, 60'tan düşürüldü.
        this.maxConcurrentRequests = 3; // Eş zamanlı maksimum ağ isteği, 6'dan düşürüldü. Sunucuyu ve istemciyi yormaz.
        this.currentRequests = 0; // Anlık olarak devam eden istek sayısı.

        // --- Kaynak Havuzları (Resource Pooling) ---
        // Her seferinde yeniden oluşturmak yerine mevcut nesneleri yeniden kullanmak için.
        this.canvasPool = [];
        this.maxPoolSize = 2; // Canvas havuz boyutu, 4'ten düşürüldü.
        this.initializeCanvasPool();

        this.workerPool = [];
        // Mevcut işlemci çekirdeği sayısına göre veya en fazla 2 worker oluşturur.
        this.maxWorkers = Math.min(2, navigator.hardwareConcurrency || 1);
        this.availableWorkers = [];
        this.initializeWorkerPool();

        // --- Önbellek (Cache) Mekanizması ---
        // Daha önce işlenmiş tile'ları saklayarak tekrar tekrar indirme/işleme yapılmasını önler.
        this.tileCache = new Map();
        this.maxCacheSize = 200; // Önbellek boyutu artırıldı (100 -> 200). Sık ziyaret edilen yerlerde performansı artırır.

        // --- İstek Kuyruğu (Request Queue) ---
        // Gelen tüm tile istekleri bu kuyruğa alınır ve önceliğe göre işlenir.
        this.requestQueue = [];
        this.isProcessingQueue = false; // Kuyruğun o an işlenip işlenmediğini belirten bayrak.

        // --- Cesium için Gerekli Standart Değişkenler ---
        this._ready = true;
        this._tilingScheme = new Cesium.GeographicTilingScheme();
        this._levelZeroMaximumGeometricError =
            Cesium.TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(
                this._tilingScheme.ellipsoid,
                this.tileSize,
                this._tilingScheme.getNumberOfXTilesAtLevel(0)
            );
        this._errorEvent = new Cesium.Event();
    }

    // --- Kaynak Havuzu Yönetim Metotları ---

    /**
     * Başlangıçta kullanılacak canvas nesnelerini oluşturur ve havuza ekler.
     */
    initializeCanvasPool() {
        for (let i = 0; i < this.maxPoolSize; i++) {
            const canvas = document.createElement("canvas");
            canvas.width = this.tileSize;
            canvas.height = this.tileSize;
            // 'willReadFrequently' performansı artırır, 'alpha: false' gereksiz alfa kanalını kaldırır.
            const context = canvas.getContext("2d", {
                willReadFrequently: true,
                alpha: false
            });
            this.canvasPool.push({ canvas, context, inUse: false });
        }
    }

    /**
     * Havuzdan kullanılabilir bir canvas nesnesi döndürür.
     */
    getAvailableCanvas() {
        let canvasObj = this.canvasPool.find(obj => !obj.inUse);
        if (!canvasObj) {
            // Eğer havuz doluysa, geçici bir canvas oluştur (nadiren olmalı).
            const canvas = document.createElement("canvas");
            canvas.width = this.tileSize;
            canvas.height = this.tileSize;
            const context = canvas.getContext("2d", { willReadFrequently: true, alpha: false });
            canvasObj = { canvas, context, inUse: true, temporary: true };
        } else {
            canvasObj.inUse = true;
        }
        return canvasObj;
    }

    /**
     * Kullanımı biten canvas'ı havuza geri verir.
     */
    releaseCanvas(canvasObj) {
        if (canvasObj.temporary) return; // Geçici olanları sil.
        canvasObj.inUse = false;
        canvasObj.context.clearRect(0, 0, this.tileSize, this.tileSize);
    }

    /**
     * Başlangıçta Web Worker'ları oluşturur ve havuza ekler.
     */
    initializeWorkerPool() {
        for (let i = 0; i < this.maxWorkers; i++) {
            // 'dem-worker.js' dosyasının projenizde olması gerekir.
            const worker = new Worker("dem-worker.js");
            this.workerPool.push(worker);
            this.availableWorkers.push(worker);
        }
    }

    /**
     * Havuzdan kullanılabilir bir worker döndürür.
     */
    getAvailableWorker() {
        return this.availableWorkers.pop();
    }

    /**
     * Kullanımı biten worker'ı havuza geri verir ve kuyruktaki yeni işi tetikler.
     */
    releaseWorker(worker) {
        this.availableWorkers.push(worker);
        this.processQueue();
    }

    // --- Önbellek Yönetim Metotları ---

    getCachedTile(x, y, level) {
        const key = `${x}-${y}-${level}`;
        return this.tileCache.get(key);
    }

    setCachedTile(x, y, level, data) {
        const key = `${x}-${y}-${level}`;
        // Önbellek dolduysa, en eski veriyi (First-In, First-Out mantığı) sil.
        if (this.tileCache.size >= this.maxCacheSize) {
            const firstKey = this.tileCache.keys().next().value;
            this.tileCache.delete(firstKey);
        }
        this.tileCache.set(key, data);
    }

    // --- Cesium'un Zorunlu Kıldığı Getters (Özellikler) ---

    get tilingScheme() { return this._tilingScheme; }
    get ready() { return this._ready; }
    get hasWaterMask() { return false; }
    get hasVertexNormals() { return false; }
    get availability() { return undefined; }
    get errorEvent() { return this._errorEvent; }

    getLevelMaximumGeometricError(level) {
        return this._levelZeroMaximumGeometricError / (1 << level);
    }

    /**
     * Kamera yüksekliğine göre belirli bir seviyedeki tile'ın yüklenip yüklenmeyeceğine karar verir.
     * Bu, çok uzaktayken gereksiz detaylı tile'ların istenmesini engeller.
     */
    getTileDataAvailable(x, y, level) {
        const cameraHeight = viewer.camera.positionCartographic.height;
        let maxAllowedLevel = this.maximumLevel;

        if (cameraHeight > 100000) maxAllowedLevel = Math.min(10, this.maximumLevel);
        else if (cameraHeight > 50000) maxAllowedLevel = Math.min(12, this.maximumLevel);
        else if (cameraHeight > 10000) maxAllowedLevel = Math.min(14, this.maximumLevel);

        return level <= maxAllowedLevel;
    }

    loadTileDataAvailability(x, y, level) { return undefined; }

    // --- Ana Mantık Metotları ---

    /**
     * Verilen tile koordinatları (x, y, level) için bir WMS GetMap isteği URL'si oluşturur.
     */
    buildWMSUrl(x, y, level) {
        const rectangle = this._tilingScheme.tileXYToRectangle(x, y, level);
        const west = Cesium.Math.toDegrees(rectangle.west);
        const south = Cesium.Math.toDegrees(rectangle.south);
        const east = Cesium.Math.toDegrees(rectangle.east);
        const north = Cesium.Math.toDegrees(rectangle.north);

        return (
            `${this.url}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&` +
            `LAYERS=${this.layerName}&STYLES=&FORMAT=${this.format}&` +
            `TRANSPARENT=false&WIDTH=${this.tileSize}&HEIGHT=${this.tileSize}&` +
            `SRS=EPSG:4326&BBOX=${west},${south},${east},${north}`
        );
    }

    /**
     * Verilen URL'den bir resim dosyası asenkron olarak çeker. Hata ve zaman aşımı kontrolü içerir.
     */
    async fetchImage(url) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = "anonymous";

            const timeout = setTimeout(() => {
                reject(new Error('Resim yükleme zaman aşımına uğradı'));
            }, 10000); // 10 saniye zaman aşımı

            image.onload = () => { clearTimeout(timeout); resolve(image); };
            image.onerror = () => { clearTimeout(timeout); reject(new Error('Resim yüklenemedi')); };
            image.src = url;
        });
    }

    /**
     * İstek kuyruğunu işlemeye başlar.
     */
    async processQueue() {
        if (this.isProcessingQueue || this.requestQueue.length === 0) return;

        this.isProcessingQueue = true;
        // Eş zamanlı istek limitini aşmayacak şekilde kuyruktan istekleri alıp işler.
        while (this.requestQueue.length > 0 && this.currentRequests < this.maxConcurrentRequests) {
            const request = this.requestQueue.shift();
            this.processRequest(request);
        }
        this.isProcessingQueue = false;
    }

    /**
     * Tek bir isteği alır ve sonucunu (arazi verisi veya hata) döndürür.
     */
    async processRequest(requestData) {
        const { x, y, level, resolve, reject } = requestData;
        try {
            this.currentRequests++;
            const result = await this.processTileGeometry(x, y, level);
            resolve(result);
        } catch (error) {
            reject(error);
        } finally {
            this.currentRequests--;
            this.processQueue(); // Bir istek bitince kuyruktaki bir sonrakini tetikle.
        }
    }

    /**
     * Bir tile'ın tüm işlenme süreci: Önbellek kontrolü, resim çekme, worker'da işleme ve sonuç.
     */
    async processTileGeometry(x, y, level) {
        const cached = this.getCachedTile(x, y, level);
        if (cached) return cached;

        const wmsUrl = this.buildWMSUrl(x, y, level);
        const image = await this.fetchImage(wmsUrl);

        const canvasObj = this.getAvailableCanvas();
        const { context } = canvasObj;

        try {
            context.drawImage(image, 0, 0);
            const imageData = context.getImageData(0, 0, this.tileSize, this.tileSize);

            // Ağır hesaplamayı Web Worker'a gönder.
            const heightBuffer = await this.processWithWorker(imageData);

            const terrainData = new Cesium.HeightmapTerrainData({
                buffer: heightBuffer,
                width: this.tileSize,
                height: this.tileSize,
                childTileMask: 0,
                // Diğer Cesium ayarları...
            });

            this.setCachedTile(x, y, level, terrainData);
            return terrainData;

        } finally {
            this.releaseCanvas(canvasObj);
        }
    }

    /**
     * imageData'yı bir Web Worker'a gönderir ve işlenmiş yükseklik verisini bekler.
     */
    async processWithWorker(imageData) {
        const worker = this.getAvailableWorker();
        if (!worker) {
            // Eğer uygun worker yoksa, yedek olarak ana thread'de çalıştır.
            console.warn("Worker bulunamadı, ana iş parçacığında işleniyor. Performans düşebilir.");
            return this.processInMainThread(imageData);
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.releaseWorker(worker);
                reject(new Error('Worker işlemi zaman aşımına uğradı'));
            }, 5000); // 5 saniye zaman aşımı

            worker.onmessage = (event) => {
                clearTimeout(timeout);
                this.releaseWorker(worker);
                if (event.data.success) {
                    resolve(event.data.heightBuffer);
                } else {
                    reject(new Error('Worker işleme hatası'));
                }
            };
            worker.onerror = (error) => {
                clearTimeout(timeout);
                this.releaseWorker(worker);
                reject(error);
            };

            // Worker'a işlenecek veriyi gönder.
            worker.postMessage({
                imageData: imageData,
                tileSize: this.tileSize,
                scale: this.scale,
                offset: this.offset
            }, [imageData.data.buffer]); // Transferable object, performansı artırır.
        });
    }

    /**
     * Yedek (fallback) metot: Worker kullanılamadığında RGB->Yükseklik dönüşümünü ana thread'de yapar.
     */
    processInMainThread(imageData) {
        // Bu fonksiyonun içeriği dem-worker.js dosyasındakiyle aynı olmalıdır.
        // ... (worker'daki hesaplama mantığı buraya kopyalanır)
        // Bu bir Promise döndürmeli ki diğer fonksiyonlarla uyumlu olsun.
        return Promise.resolve(/* heightBuffer */);
    }

    /**
     * Cesium tarafından çağrılan ana metot. Bir tile için geometri verisi ister.
     */
    async requestTileGeometry(x, y, level, request) {
        // --- İstek Filtreleme ve Kısıtlama ---
        // Kamera hareket halindeyken yüksek detaylı istekleri atla.
        if (viewer.scene.camera.isMoving || viewer.scene.camera.isFlying) {
            if (level > 12) return Promise.resolve(undefined);
        }
        // Çok yakın zoom'da eş zamanlı istek sayısını daha da sınırla.
        const cameraHeight = viewer.camera.positionCartographic.height;
        if (cameraHeight < 1000 && this.currentRequests >= 2) {
            return Promise.resolve(undefined);
        }

        // --- İstek Kuyruğu Yönetimi ---
        return new Promise((resolve, reject) => {
            const priority = this.calculatePriority(x, y, level, cameraHeight);
            const currentTime = Date.now();

            this.requestQueue.push({
                x, y, level, resolve, reject,
                priority,
                timestamp: currentTime
            });

            // Kuyruğu önceliğe göre sırala (yüksek öncelikli olanlar başa gelir).
            this.requestQueue.sort((a, b) => b.priority - a.priority);
            // Çok eski (2 saniyeden eski) istekleri temizle.
            this.cleanupOldRequests(currentTime);
            // Kuyruğu işlemeye başla.
            this.processQueue();
        });
    }

    /**
     * Bir isteğin önceliğini, kameraya olan uzaklığa ve zoom seviyesine göre hesaplar.
     */
    calculatePriority(x, y, level, cameraHeight) {
        let priority = 100 - level; // Düşük seviyeler (daha geniş alanlar) daha önceliklidir.
        if (cameraHeight < 5000) priority += 50; // Yakın zoomdaki tile'lar çok daha öncelikli.
        else if (cameraHeight > 50000) priority -= 30; // Uzak zoomdakilerin önceliği düşük.
        return priority;
    }

    /**
     * Kuyruktaki çok eski istekleri iptal eder.
     */
    cleanupOldRequests(currentTime) {
        const oldRequests = this.requestQueue.filter(req => currentTime - req.timestamp > 2000);
        oldRequests.forEach(req => req.resolve(undefined)); // Hata vermeden isteği sonlandır.
        this.requestQueue = this.requestQueue.filter(req => currentTime - req.timestamp <= 2000);
    }

    /**
     * Provider yok edildiğinde kaynakları (worker'lar, cache) temizler.
     */
    destroy() {
        this.workerPool.forEach(worker => worker.terminate());
        this.workerPool = [];
        this.availableWorkers = [];
        this.tileCache.clear();
        this.requestQueue = [];
    }
}


//***********************************************************************************
// BÖLÜM: CESIUM VIEWER OLUŞTURMA VE GENEL PERFORMANS AYARLARI
//***********************************************************************************
const viewer = new Cesium.Viewer("cesiumContainer", {
    // --- GÖRSEL ARAYÜZ AYARLARI ---
    scene3DOnly: true,             // Sadece 3D modunda çalışır.
    baseLayerPicker: true,         // Altlık harita seçme menüsü.
    animation: false,              // Animasyon widget'ı kapalı.
    timeline: false,               // Zaman çizgisi widget'ı kapalı.
    geocoder: false,               // Arama kutusu kapalı.
    homeButton: false,             // Ana görünüm butonu kapalı.
    sceneModePicker: false,        // 2D/3D mod seçimi kapalı.
    navigationHelpButton: false,   // Yardım butonu kapalı.
    shadows: false,                // Gölgeler kapalı (performans).

    // --- TEMEL RENDER AYARLARI (PERFORMANS ODAKLI) ---
    contextOptions: {
        webgl: {
            alpha: false,                   // Arka plan saydamlığı kapalı.
            stencil: false,
            depth: true,
            antialias: true,               // Kenar yumuşatma kapalı (ciddi performans artışı).
            preserveDrawingBuffer: true,   // Performans için önerilir.
        },
        allowTextureFilterAnisotropic: true, // Doku filtreleme kapalı (küçük performans artışı).
    },

    // --- BAŞLANGIÇ KATMANLARI ---
    imageryProvider: new Cesium.ArcGisMapServerImageryProvider({
        url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
    }),
    terrainProvider: new Cesium.EllipsoidTerrainProvider(), // Başlangıçta düz arazi.
});

//***********************************************************************************
// BÖLÜM: CESIUM SAHNE PERFORMANS OPTİMİZASYONLARI (AGRESİF)
//***********************************************************************************
// --- GÖRSEL KALİTEYİ DÜŞÜREREK PERFORMANSI ARTIRAN AYARLAR ---
viewer.resolutionScale = 1; // Render çözünürlüğünü %60'a düşür. FPS'i ciddi artırır.
viewer.resolutionScale = window.devicePixelRatio; // Yüksek çözünürlüklü ekranlar için en net görüntü
viewer.scene.globe.maximumScreenSpaceError = 1; // Daha düşük kaliteli arazi tile'ları yükle. (Varsayılan: 2.0)
viewer.scene.fxaa = true; // Kenar yumuşatma efekti kapalı.
viewer.orderIndependentTranslucency = true;

// --- BELLEK VE YÜKLEME OPTİMİZASYONLARI ---
viewer.scene.globe.tileCacheSize = 200; // Cesium'un kendi tile önbelleğini küçült (RAM tasarrufu).
viewer.scene.globe.preloadSiblings = true; // Görünen tile'ların komşularını önceden yükleme.
viewer.scene.globe.preloadAncestors = true; // Görünen tile'ların üst seviyelerini önceden yükleme.
viewer.scene.globe.skipLevelOfDetail = false; // Hızlı hareketlerde detay seviyelerini atla (çok önemli!).
viewer.scene.globe.baseColor = Cesium.Color.BLACK; // Tile'lar yüklenirken siyah arka plan göster.

// --- IŞIKLANDIRMA VE ATMOSFER EFEKTLERİNİ KAPATMA ---
viewer.scene.globe.enableLighting = true; // Küre aydınlatması kapalı (GPU yükünü azaltır).
viewer.scene.fog.enabled = true;          // Sis efekti kapalı.
viewer.scene.skyAtmosphere.show = true;   // Atmosfer efekti kapalı.
viewer.scene.sun.show = true;             // Güneş'i gizle.
viewer.scene.moon.show = false;            // Ay'ı gizle.

// --- AĞ (NETWORK) OPTİMİZASYONLARI ---
Cesium.RequestScheduler.maximumRequestsPerServer = 16; // Sunucu başına maksimum istek sayısını düşür.
Cesium.RequestScheduler.maximumRequests = 24;         // Toplam maksimum istek sayısını düşür.

//***********************************************************************************
// BÖLÜM: KULLANICI ARAYÜZÜ FONKSİYONLARI
// AMAÇ: HTML'deki butonlara basıldığında çalışacak fonksiyonlar.
//***********************************************************************************

/**
 * Kullanıcının girdiği bilgilere göre DEM arazi katmanını yükler.
 */
async function loadDEMTerrain() {
    // Eski terrain provider'ı hafızadan temizle.
    if (viewer.terrainProvider && viewer.terrainProvider.destroy) {
        viewer.terrainProvider.destroy();
    }
    const terrainProvider = new DEMTerrainProvider({
        url: document.getElementById("geoserverUrl").value,
        layerName: document.getElementById("layerName").value,
        maximumLevel: parseInt(document.getElementById("maxLevel").value),
    });
    viewer.terrainProvider = terrainProvider;
    viewer.scene.globe.terrainExaggeration = parseFloat(document.getElementById("exaggeration").value);
    console.log("DEM arazi katmanı başarıyla yüklendi.");
}

/**
 * Kullanıcının girdiği bilgilere göre uydu görüntüsü altlığını yükler.
 */
function loadSatelliteImagery() {
    viewer.imageryLayers.removeAll(); // Mevcut tüm altlıkları kaldır.
    const wmsImageryProvider = new Cesium.WebMapServiceImageryProvider({
        url: document.getElementById("geoserverUrl").value,
        layers: document.getElementById("satelliteLayerName").value,
        parameters: { format: "image/png", transparent: "false", srs: "EPSG:4326" },
    });
    viewer.imageryLayers.addImageryProvider(wmsImageryProvider);
    console.log("Uydu görüntüsü başarıyla yüklendi.");
}

// Diğer arayüz fonksiyonları (reset, loadBoth vs.)

//***********************************************************************************
// BÖLÜM: KULLANICI ETKİLEŞİMİ VE OLAY YÖNETİCİLERİ
//***********************************************************************************

// FPS sayacını ekranda göster (debug için).
viewer.scene.debugShowFramesPerSecond = true;

/**
 * Sol fare tıklamasıyla tıklanan noktanın koordinatlarını ve yüksekliğini gösterir.
 */
viewer.screenSpaceEventHandler.setInputAction(function (click) {
    const pickedPosition = viewer.scene.pickPosition(click.position);
    if (Cesium.defined(pickedPosition)) {
        const cartographic = Cesium.Cartographic.fromCartesian(pickedPosition);
        const lon = Cesium.Math.toDegrees(cartographic.longitude);
        const lat = Cesium.Math.toDegrees(cartographic.latitude);
        const height = cartographic.height;
        alert(`Enlem: ${lat.toFixed(5)}, Boylam: ${lon.toFixed(5)}, Yükseklik: ${height.toFixed(2)} m`);
    }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

/**
 * Fare hareket ettikçe imlecin altındaki noktanın bilgilerini bir üst uygulamaya (WPF WebView2 gibi) gönderir.
 */
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
handler.setInputAction(function (movement) {
    const pickRay = viewer.camera.getPickRay(movement.endPosition);
    const pickPosition = viewer.scene.globe.pick(pickRay, viewer.scene);

    if (Cesium.defined(pickPosition)) {
        const cartographic = Cesium.Cartographic.fromCartesian(pickPosition);
        // WPF uygulamasına veri gönder
        if (window.chrome && window.chrome.webview) {
            window.chrome.webview.postMessage({
                type: "mouseMove",
                lat: Cesium.Math.toDegrees(cartographic.latitude),
                lon: Cesium.Math.toDegrees(cartographic.longitude),
                height: cartographic.height,
            });
        }
    }
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);


//***********************************************************************************
// BÖLÜM: ADAPTİF PERFORMANS İZLEME VE OTOMATİK OPTİMİZASYON
// AMAÇ: Uygulamanın performansını anlık olarak izleyip, gerekirse görsel kaliteyi
// düşürerek FPS'i hedeflenen seviyede tutmak.
//***********************************************************************************
let frameCount = 0;
let lastTime = performance.now();

function monitorPerformance() {
    frameCount++;
    const currentTime = performance.now();

    // Her saniye FPS'i hesapla
    if (currentTime - lastTime >= 1000) {
        const fps = frameCount;
        frameCount = 0;
        lastTime = currentTime;

        // FPS çok düştüyse (20'nin altı), en agresif optimizasyonları yap.
        if (fps < 20) {
            // Arazi kalitesini düşür
            viewer.scene.globe.maximumScreenSpaceError = Math.min(64, viewer.scene.globe.maximumScreenSpaceError * 1.5);
            // Render çözünürlüğünü daha da düşür
            viewer.resolutionScale = Math.max(0.4, viewer.resolutionScale * 0.9);
        }
        // FPS düşükse (25'in altı), orta seviye optimizasyon yap.
        else if (fps < 25) {
            viewer.scene.globe.maximumScreenSpaceError = Math.min(48, viewer.scene.globe.maximumScreenSpaceError * 1.2);
            viewer.resolutionScale = Math.max(0.5, viewer.resolutionScale * 0.95);
        }
        // FPS iyiyse (35'in üstü), kaliteyi yavaşça geri artırmayı dene.
        else if (fps > 35) {
            viewer.scene.globe.maximumScreenSpaceError = Math.max(16, viewer.scene.globe.maximumScreenSpaceError * 0.98);
            viewer.resolutionScale = Math.min(0.8, viewer.resolutionScale * 1.01);
        }

        if (fps < 25) {
            console.warn(`Düşük FPS: ${fps} - Adaptif optimizasyonlar uygulandı.`);
        }
    }

    requestAnimationFrame(monitorPerformance);
}

// Performans izleyiciyi başlat.
monitorPerformance();

// Sayfa kapatılırken kaynakları temizle.
window.addEventListener('beforeunload', function () {
    if (viewer.terrainProvider && viewer.terrainProvider.destroy) {
        viewer.terrainProvider.destroy();
    }
});