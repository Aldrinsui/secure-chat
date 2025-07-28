/**
 * Truncates a string, typically a key, to a more readable format.
 * @param key The string to truncate.
 * @param start The number of characters to show from the start.
 * @param end The number of characters to show from the end.
 * @returns The truncated string.
 */
export const truncateKey = (key: string | null | undefined, start = 12, end = 8): string => {
    if (!key) return '';
    if (key.length <= start + end) return key;
    return `${key.substring(0, start)}...${key.substring(key.length - end)}`;
};

/**
 * Copies a string to the user's clipboard.
 * @param text The text to copy.
 * @returns A promise that resolves to true if successful, false otherwise.
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
    if (!navigator.clipboard) {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.top = "0";
            textArea.style.left = "0";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const success = document.execCommand('copy');
            document.body.removeChild(textArea);
            return !!success;
        } catch (err) {
            console.error('Fallback copy failed', err);
            return false;
        }
    }
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error('Async copy failed', err);
        return false;
    }
};

/**
 * Resizes an image file to the specified dimensions and returns a Base64 string.
 * @param file The image file to resize.
 * @param maxWidth The maximum width of the resized image.
 * @param maxHeight The maximum height of the resized image.
 * @returns A promise that resolves to the Base64 string of the resized image.
 */
export const resizeImage = (file: File, maxWidth: number, maxHeight: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = Math.round((width * maxHeight) / height);
                    height = maxHeight;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error('Could not get canvas context'));
            }
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/webp', 0.8)); // Use WebP for better compression
        };
        img.onerror = (error) => {
            reject(error);
        };
    });
};