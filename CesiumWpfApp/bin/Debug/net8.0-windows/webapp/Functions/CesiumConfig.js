//***********************************************************************************
// BÖLÜM: CESIUM VIEWER OLUŞTURMA VE GENEL PERFORMANS AYARLARI
//***********************************************************************************

/**
 * Cesium viewer'ı oluşturur ve temel performans ayarlarını yapar
 */
function createCesiumViewer() {
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

    return viewer;
}

/**
 * Cesium sahne performans optimizasyonlarını uygular
 */
function applyCesiumOptimizations(viewer) {
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

    // FPS sayacını ekranda göster (debug için).
    viewer.scene.debugShowFramesPerSecond = true;
}