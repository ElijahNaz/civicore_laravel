const TARGET_LONG_EDGE = 1024;
const MAX_LONG_EDGE = 1024;

const detectDeviceType = () => {
    if (typeof window === 'undefined') return 'desktop';
    const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches;
    const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator?.userAgent || '');
    return coarsePointer || mobileUA ? 'mobile' : 'desktop';
};

const getLongEdgeScale = (width, height) => {
    const longEdge = Math.max(width, height);
    if (longEdge <= MAX_LONG_EDGE) return 1;
    return TARGET_LONG_EDGE / longEdge;
};

const loadImageFromFile = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
    };
    img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to decode image file.'));
    };
    img.src = url;
});

const canvasToBlob = (canvas, mimeType, quality) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
        if (!blob) {
            reject(new Error('Failed to encode output image.'));
            return;
        }
        resolve(blob);
    }, mimeType, quality);
});

const applyGrayscaleAndContrast = (ctx, width, height) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const { data } = imageData;

    let minGray = 255;
    let maxGray = 0;
    const grayValues = new Uint8ClampedArray(width * height);

    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
        const gray = Math.round((data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114));
        grayValues[p] = gray;
        if (gray < minGray) minGray = gray;
        if (gray > maxGray) maxGray = gray;
    }

    const range = Math.max(1, maxGray - minGray);

    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
        const normalized = Math.min(255, Math.max(0, Math.round(((grayValues[p] - minGray) / range) * 255)));
        data[i] = normalized;
        data[i + 1] = normalized;
        data[i + 2] = normalized;
    }

    ctx.putImageData(imageData, 0, 0);
    return { minGray, maxGray };
};

const computeBlurScore = (ctx, width, height) => {
    const { data } = ctx.getImageData(0, 0, width, height);
    let sum = 0;
    let sumSq = 0;
    let count = 0;

    const index = (x, y) => ((y * width) + x) * 4;

    for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
            const center = data[index(x, y)];
            const lap = Math.abs((4 * center)
                - data[index(x - 1, y)]
                - data[index(x + 1, y)]
                - data[index(x, y - 1)]
                - data[index(x, y + 1)]);
            sum += lap;
            sumSq += lap * lap;
            count += 1;
        }
    }

    if (!count) return 0;
    const mean = sum / count;
    const variance = Math.max(0, (sumSq / count) - (mean * mean));
    return Number(Math.sqrt(variance).toFixed(2));
};

const computeBrightnessScore = (minGray, maxGray) => Number((((minGray + maxGray) / 2) / 255).toFixed(3));

const getOutputMimeType = (inputType = '') => (inputType.includes('webp') ? 'image/webp' : 'image/jpeg');

const tryPerspectiveTransform = ({ sourceFile, corners }) => {
    if (!corners || typeof window === 'undefined') return sourceFile;

    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(sourceFile);
        img.onload = async () => {
            try {
                // Compute absolute pixel bounds from normalized coordinates with safety clamping
                const minX = Math.max(0, Math.min(img.width - 1, Math.round(Math.min(corners.tl.x, corners.bl.x, corners.tr.x, corners.br.x) * img.width)));
                const maxX = Math.max(minX + 1, Math.min(img.width, Math.round(Math.max(corners.tl.x, corners.bl.x, corners.tr.x, corners.br.x) * img.width)));
                const minY = Math.max(0, Math.min(img.height - 1, Math.round(Math.min(corners.tl.y, corners.bl.y, corners.tr.y, corners.br.y) * img.height)));
                const maxY = Math.max(minY + 1, Math.min(img.height, Math.round(Math.max(corners.tl.y, corners.bl.y, corners.tr.y, corners.br.y) * img.height)));

                const sw = maxX - minX;
                const sh = maxY - minY;

                const outputCanvas = document.createElement('canvas');
                outputCanvas.width = sw;
                outputCanvas.height = sh;
                const ctx = outputCanvas.getContext('2d');
                ctx.drawImage(img, minX, minY, sw, sh, 0, 0, sw, sh);

                const outputType = getOutputMimeType(sourceFile.type);
                const blob = await canvasToBlob(outputCanvas, outputType, 0.88);
                const transformed = new File([blob], sourceFile.name, { type: outputType, lastModified: Date.now() });

                resolve(transformed);
            } catch (err) {
                console.error("Canvas crop failed, returning original file:", err);
                resolve(sourceFile);
            } finally {
                URL.revokeObjectURL(url);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(sourceFile);
        };
        img.src = url;
    });
};

export const preprocessUploadFile = async (input, options = {}) => {
    const sourceFile = input?.file || input;
    if (!(sourceFile instanceof File)) {
        return { file: input, qualityMetadata: null };
    }

    if (!sourceFile.type.startsWith('image/')) {
        return {
            file: sourceFile,
            qualityMetadata: {
                blur: null,
                brightness: null,
                edge_stability: null,
                device_type: options.deviceType || detectDeviceType()
            }
        };
    }

    const transformedFile = await tryPerspectiveTransform({ sourceFile, corners: options.corners });
    const img = await loadImageFromFile(transformedFile);

    const scale = getLongEdgeScale(img.width, img.height);
    const outWidth = Math.max(1, Math.round(img.width * scale));
    const outHeight = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outWidth;
    canvas.height = outHeight;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(img, 0, 0, outWidth, outHeight);
    const contrastStats = applyGrayscaleAndContrast(ctx, outWidth, outHeight);

    const blur = computeBlurScore(ctx, outWidth, outHeight);
    const brightness = computeBrightnessScore(contrastStats.minGray, contrastStats.maxGray);
    const edgeStability = typeof options.edgeStability === 'number'
        ? Number(options.edgeStability.toFixed(3))
        : null;

    const outputMimeType = getOutputMimeType(transformedFile.type || sourceFile.type);
    const compressedBlob = await canvasToBlob(canvas, outputMimeType, outputMimeType === 'image/webp' ? 0.84 : 0.86);

    const extension = outputMimeType === 'image/webp' ? 'webp' : 'jpg';
    const baseName = sourceFile.name.replace(/\.[^/.]+$/, '');

    return {
        file: new File([compressedBlob], `${baseName}-preprocessed.${extension}`, {
            type: outputMimeType,
            lastModified: Date.now()
        }),
        qualityMetadata: {
            blur,
            brightness,
            edge_stability: edgeStability,
            device_type: options.deviceType || detectDeviceType()
        }
    };
};
