//***********************************************************************************
// BÖLÜM: ADAPTİF PERFORMANS İZLEME VE OTOMATİK OPTİMİZASYON
// AMAÇ: Uygulamanın performansını anlık olarak izleyip, gerekirse görsel kaliteyi
// düşürerek FPS'i hedeflenen seviyede tutmak.
//***********************************************************************************

class PerformanceMonitor {
    constructor(viewer) {
        this.viewer = viewer;
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.targetFPS = 30;
        this.lowFPSThreshold = 20;
        this.mediumFPSThreshold = 25;
        this.highFPSThreshold = 35;

        this.minResolutionScale = 0.4;
        this.maxResolutionScale = 0.8;
        this.minScreenSpaceError = 16;
        this.maxScreenSpaceError = 64;
    }

    /**
     * Performans izlemeyi başlatır
     */
    startMonitoring() {
        this.monitorPerformance();
    }

    /**
     * Ana performans izleme döngüsü
     */
    monitorPerformance() {
        this.frameCount++;
        const currentTime = performance.now();

        // Her saniye FPS'i hesapla
        if (currentTime - this.lastTime >= 1000) {
            const fps = this.frameCount;
            this.frameCount = 0;
            this.lastTime = currentTime;

            this.adjustPerformanceSettings(fps);
        }

        requestAnimationFrame(() => this.monitorPerformance());
    }

    /**
     * FPS değerine göre performans ayarlarını otomatik olarak ayarlar
     */
    adjustPerformanceSettings(fps) {
        // FPS çok düştüyse (20'nin altı), en agresif optimizasyonları yap.
        if (fps < this.lowFPSThreshold) {
            this.applyAggressiveOptimizations();
            console.warn(`Çok düşük FPS: ${fps} - Agresif optimizasyonlar uygulandı.`);
        }
        // FPS düşükse (25'in altı), orta seviye optimizasyon yap.
        else if (fps < this.mediumFPSThreshold) {
            this.applyMediumOptimizations();
            console.warn(`Düşük FPS: ${fps} - Orta seviye optimizasyonlar uygulandı.`);
        }
        // FPS iyiyse (35'in üstü), kaliteyi yavaşça geri artırmayı dene.
        else if (fps > this.highFPSThreshold) {
            this.improveQuality();
        }
    }

    /**
     * Agresif performans optimizasyonları uygular
     */
    applyAggressiveOptimizations() {
        // Arazi kalitesini düşür
        const currentError = this.viewer.scene.globe.maximumScreenSpaceError;
        this.viewer.scene.globe.maximumScreenSpaceError =
            Math.min(this.maxScreenSpaceError, currentError * 1.5);

        // Render çözünürlüğünü daha da düşür
        this.viewer.resolutionScale =
            Math.max(this.minResolutionScale, this.viewer.resolutionScale * 0.9);
    }

    /**
     * Orta seviye performans optimizasyonları uygular
     */
    applyMediumOptimizations() {
        const currentError = this.viewer.scene.globe.maximumScreenSpaceError;
        this.viewer.scene.globe.maximumScreenSpaceError =
            Math.min(48, currentError * 1.2);

        this.viewer.resolutionScale =
            Math.max(0.5, this.viewer.resolutionScale * 0.95);
    }

    /**
     * Performans iyiyse kaliteyi yavaşça artırır
     */
    improveQuality() {
        const currentError = this.viewer.scene.globe.maximumScreenSpaceError;
        this.viewer.scene.globe.maximumScreenSpaceError =
            Math.max(this.minScreenSpaceError, currentError * 0.98);

        this.viewer.resolutionScale =
            Math.min(this.maxResolutionScale, this.viewer.resolutionScale * 1.01);
    }

    /**
     * Mevcut performans ayarlarını döndürür
     */
    getCurrentSettings() {
        return {
            resolutionScale: this.viewer.resolutionScale,
            maximumScreenSpaceError: this.viewer.scene.globe.maximumScreenSpaceError,
            tileCacheSize: this.viewer.scene.globe.tileCacheSize
        };
    }

    /**
     * Performans ayarlarını manuel olarak sıfırlar
     */
    resetToDefaults() {
        this.viewer.resolutionScale = 1.0;
        this.viewer.scene.globe.maximumScreenSpaceError = 2.0;
        console.log("Performans ayarları varsayılan değerlere sıfırlandı.");
    }
}