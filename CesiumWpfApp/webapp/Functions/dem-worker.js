// dem-worker.js - FULL OPTIMIZED VERSION
self.onmessage = function (event) {
    const { imageData, tileSize, scale, offset } = event.data;

    try {
        const pixels = imageData.data;
        const length = tileSize * tileSize;

        // Float32Array oluştur
        const heightBuffer = new Float32Array(length);

        // SIMD-style işleme: 8'li gruplar
        const batchSize = 8;
        let i = 0;

        // Ana döngü
        for (; i < length - batchSize + 1; i += batchSize) {
            for (let j = 0; j < batchSize; j++) {
                const idx = i + j;
                const pixelIndex = idx << 2; // idx * 4 (bit shift daha hızlı)

                const r = pixels[pixelIndex];
                const g = pixels[pixelIndex + 1];
                const b = pixels[pixelIndex + 2];

                // RGB → Encoded value (bit shifting)
                const encodedValue = (r << 16) | (g << 8) | b;

                // NoData kontrolü ve dönüşüm
                if (encodedValue === 0) {
                    // RGB(0,0,0) = NoData
                    heightBuffer[idx] = -10000; // veya istediğiniz NoData değeri
                } else if (encodedValue === 16777215) {
                    // RGB(255,255,255) = Maksimum değer (isteğe bağlı)
                    heightBuffer[idx] = 0;
                } else {
                    // Normal dönüşüm: height = (encoded * scale) + offset
                    heightBuffer[idx] = (encodedValue * scale) + offset;
                }
            }
        }

        // Kalan pixeller
        for (; i < length; i++) {
            const pixelIndex = i << 2;
            const r = pixels[pixelIndex];
            const g = pixels[pixelIndex + 1];
            const b = pixels[pixelIndex + 2];

            const encodedValue = (r << 16) | (g << 8) | b;

            if (encodedValue === 0) {
                heightBuffer[i] = -10000;
            } else if (encodedValue === 16777215) {
                heightBuffer[i] = 0;
            } else {
                heightBuffer[i] = (encodedValue * scale) + offset;
            }
        }

        // CRITICAL: Transferable object kullan (büyük performans artışı)
        self.postMessage({
            success: true,
            heightBuffer: heightBuffer.buffer
        }, [heightBuffer.buffer]);

    } catch (error) {
        console.error('Worker error:', error);
        self.postMessage({
            success: false,
            error: error.message
        });
    }
};