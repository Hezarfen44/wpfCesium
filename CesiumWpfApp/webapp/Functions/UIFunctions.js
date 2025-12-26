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

/**
 * Arazi katmanını sıfırlar (düz arazi)
 */
function resetTerrain() {
    if (viewer.terrainProvider && viewer.terrainProvider.destroy) {
        viewer.terrainProvider.destroy();
    }
    viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
    console.log("Arazi katmanı sıfırlandı.");
}

/**
 * Hem DEM arazi hem de uydu görüntüsünü birlikte yükler
 */
async function loadBoth() {
    try {
        await loadDEMTerrain();
        loadSatelliteImagery();
        console.log("Hem arazi hem de uydu görüntüsü yüklendi.");
    } catch (error) {
        console.error("Yükleme hatası:", error);
    }
}

/**
 * Görünümü belirli bir konuma odaklar
 */
function flyToLocation(longitude, latitude, height = 10000) {
    viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, height),
        duration: 2.0
    });
}

/**
 * Performans ayarlarını günceller
 */
function updatePerformanceSettings() {
    const maxLevel = parseInt(document.getElementById("maxLevel").value) || 12;
    const exaggeration = parseFloat(document.getElementById("exaggeration").value) || 1.0;

    if (viewer.terrainProvider instanceof DEMTerrainProvider) {
        viewer.terrainProvider.maximumLevel = maxLevel;
    }
    viewer.scene.globe.terrainExaggeration = exaggeration;
    console.log(`Performans ayarları güncellendi: MaxLevel=${maxLevel}, Exaggeration=${exaggeration}`);
}