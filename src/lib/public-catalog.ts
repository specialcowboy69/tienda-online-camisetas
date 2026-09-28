import { listCatalogProducts } from "./firestore";
import type { CatalogProduct } from "./types";

export type PublicCatalogResult = {
  products: CatalogProduct[];
  status: "available" | "unavailable";
};

export async function getPublicCatalog(): Promise<PublicCatalogResult> {
  try {
    return { products: await listCatalogProducts(), status: "available" };
  } catch {
    return { products: [], status: "unavailable" };
  }
}
