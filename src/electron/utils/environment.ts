export const isDev = (): boolean => {
  // Multiple checks to ensure we detect development correctly
  return (
    process.env.NODE_ENV === "development" ||
    process.env.ELECTRON_IS_DEV === "1" ||
    !process.env.NODE_ENV ||
    process.defaultApp ||
    /[\\/]electron-prebuilt[\\/]/.test(process.execPath) ||
    /[\\/]electron[\\/]/.test(process.execPath)
  );
};

export const getAppVersion = (): string => {
  return process.env.npm_package_version || "1.0.0";
};

export const isProduction = (): boolean => {
  return !isDev();
};
