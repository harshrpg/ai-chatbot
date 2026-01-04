// Global tracking of loaded scripts
const loadedScripts = new Set<string>();
const loadingScripts = new Map<string, Promise<void>>();

// Global tracking of loaded CSS
const loadedCSS = new Set<string>();

export const loadScript = (src: string): Promise<void> => {
    // Check if script is already loaded
    if (loadedScripts.has(src)) {
        return Promise.resolve();
    }

    // Check if script is currently loading
    if (loadingScripts.has(src)) {
        return loadingScripts.get(src)!;
    }

    const promise = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => {
            loadedScripts.add(src);
            loadingScripts.delete(src);
            resolve();
        };
        script.onerror = () => {
            loadingScripts.delete(src);
            reject(new Error(`Failed to load script: ${src}`));
        };
        document.head.appendChild(script);
    });

    loadingScripts.set(src, promise);
    return promise;
};

export const loadCSS = (href: string): void => {
    // Check if CSS is already loaded
    if (loadedCSS.has(href)) {
        return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = href;
    document.head.appendChild(link);
    loadedCSS.add(href);
};