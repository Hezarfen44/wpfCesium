//***********************************************************************************
// BÖLÜM: KULLANICI ETKİLEŞİMİ VE OLAY YÖNETİCİLERİ
//***********************************************************************************

/**
 * Tüm olay yöneticilerini ayarlar
 */
function setupEventHandlers(viewer) {
    setupClickHandler(viewer);
    setupMouseMoveHandler(viewer);
    setupCleanupHandler(viewer);
}

/**
 * Sol fare tıklamasıyla tıklanan noktanın koordinatlarını ve yüksekliğini gösterir.
 */
function setupClickHandler(viewer) {
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
}

/**
 * Fare hareket ettikçe imlecin altındaki noktanın bilgilerini bir üst uygulamaya (WPF WebView2 gibi) gönderir.
 */
function setupMouseMoveHandler(viewer) {
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
}

/**
 * Sayfa kapatılırken kaynakları temizle.
 */
function setupCleanupHandler(viewer) {
    window.addEventListener('beforeunload', function () {
        if (viewer.terrainProvider && viewer.terrainProvider.destroy) {
            viewer.terrainProvider.destroy();
        }
    });
}