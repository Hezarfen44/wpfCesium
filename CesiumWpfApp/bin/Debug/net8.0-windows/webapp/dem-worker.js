// dem-worker.js - Zoom-in için süper optimize edilmiş versiyon
let imageDataCache = new Map();
const MAX_CACHE_SIZE = 10;

self.onmessage = function (event) {
    const { imageData, tileSize, scale, offset } = event.data;

    // Basit cache kontrolü
    const cacheKey = `${tileSize}-${scale}-${offset}`;

    try {
        const pixels = imageData.data;
        const length = tileSize * tileSize;

        // ArrayBuffer kullanarak daha verimli bellek yönetimi
        const buffer = new ArrayBuffer(length * 4); // Float32 = 4 bytes
        const heightBuffer = new Float32Array(buffer);

        // Optimize edilmiş döngü - 8'li gruplar halinde işle
        let i = 0;
        const batchSize = 8;

        for (; i < length - batchSize + 1; i += batchSize) {
            // 8 pixel'i parallel işle
            for (let j = 0; j < batchSize; j++) {
                const idx = i + j;
                const pixelIndex = idx * 4;
                const r = pixels[pixelIndex];
                const g = pixels[pixelIndex + 1];
                const b = pixels[pixelIndex + 2];

                // Bit shifting ile daha hızlı hesaplama
                const encodedValue = (r << 16) | (g << 8) | b;

                // Özel değer kontrolü daha hızlı
                heightBuffer[idx] = encodedValue === 16777215 ? 0 : encodedValue * scale + offset;
            }
        }

        // Kalan pixelleri işle
        for (; i < length; i++) {
            const pixelIndex = i * 4;
            const r = pixels[pixelIndex];
            const g = pixels[pixelIndex + 1];
            const b = pixels[pixelIndex + 2];
            const encodedValue = (r << 16) | (g << 8) | b;
            heightBuffer[i] = encodedValue === 16777215 ? 0 : encodedValue * scale + offset;
        }

        // Transfer OLMADAN gönder (daha güvenli)
        self.postMessage({
            heightBuffer: heightBuffer,
            success: true
        });

    } catch (error) {
        console.error('Worker error:', error);
        self.postMessage({
            success: false,
            error: error.message
        });
    }
};