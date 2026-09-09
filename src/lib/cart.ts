import { CartItemInput } from "./types";

type CartItemInputLike = CartItemInput & Record<string, unknown>;

export function toCartItemInputs(cartItems: CartItemInputLike[]): CartItemInput[] {
  return cartItems.map(({ productId, syncVariantId, quantity }) => ({
    productId,
    syncVariantId,
    quantity
  }));
}
