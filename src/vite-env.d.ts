/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_BASE_URL: string;
    readonly VITE_FEATURE_ENGLISH_RENDER_ENABLED?: string;
    readonly VITE_FEATURE_ENGLISH_SUBMISSION_ENABLED?: string;
    readonly VITE_FEATURE_PHYSICS_RENDER_ENABLED?: string;
    readonly VITE_FEATURE_PHYSICS_SUBMISSION_ENABLED?: string;
    readonly VITE_FEATURE_CHEMISTRY_RENDER_ENABLED?: string;
    readonly VITE_FEATURE_CHEMISTRY_SUBMISSION_ENABLED?: string;
    readonly VITE_SUBSCRIBE_LINK_S1?: string;
    readonly VITE_SUBSCRIBE_LINK_S2?: string;
    readonly VITE_SUBSCRIBE_LINK_S5?: string;
    readonly VITE_SUBSCRIBE_LINK_ADDON?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
