//***********************************************************************************
// ANA UYGULAMA DOSYASI
// AMAÇ: Tüm modülleri bir araya getirerek Cesium uygulamasını başlatır
//***********************************************************************************

// Global değişkenler
let viewer;
let performanceMonitor;

/**
 * Uygulamayı başlatır
 */
function initializeApp() {
    try {
        // Cesium viewer'ı oluştur
        viewer = createCesiumViewer();

        // Global erişim için window'a ekle
        window.viewer = viewer;

        // Performans optimizasyonlarını uygula
        applyCesiumOptimizations(viewer);

        // Olay yöneticilerini ayarla
        setupEventHandlers(viewer);

        // Performans izleyiciyi başlat
        performanceMonitor = new PerformanceMonitor(viewer);
        performanceMonitor.startMonitoring();

        console.log("Cesium uygulaması başarıyla başlatıldı.");

    } catch (error) {
        console.error("Uygulama başlatma hatası:", error);
    }
}

/**
 * Uygulamayı temizler
 */
function cleanupApp() {
    if (viewer) {
        if (viewer.terrainProvider && viewer.terrainProvider.destroy) {
            viewer.terrainProvider.destroy();
        }
        viewer.destroy();
    }
}

// DOM yüklendiğinde uygulamayı başlat
document.addEventListener('DOMContentLoaded', initializeApp);

// Sayfa kapatılırken temizlik yap
window.addEventListener('beforeunload', cleanupApp);