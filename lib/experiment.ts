export const EXPERIMENT_ID = "category-examples-v1";
export const experimentEnabled = () => process.env.INTENTCART_AB_ENABLED === "true";
export const experimentExcluded = (username: string) => (process.env.INTENTCART_AB_EXCLUDED_USERS ?? "").split(",").map(s => s.trim().toLowerCase()).includes(username);
export const experimentAdmin = (username: string) => (process.env.INTENTCART_AB_ADMIN_USERS ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean).includes(username);
