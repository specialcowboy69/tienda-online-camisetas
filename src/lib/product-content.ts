export type ProductContent = {
  status: "verified";
  heading: string;
  summary: string;
  fitFeel: string[];
  specsTitle: string;
  specs: string[];
  customerNote?: string;
};

export const productContentById: Record<string, ProductContent> = {
  "468682936": {
    status: "verified",
    heading: "THE TEE, NOT THE DRAMA",
    summary: "Heavyweight, soft, and made for repeat wear. This relaxed-fit, garment-dyed tee has a structured feel without feeling stiff.",
    fitFeel: ["Heavyweight", "Relaxed fit", "Garment-dyed"],
    specsTitle: "TEE SPECS",
    specs: [
      "100% ring-spun cotton",
      "6.1 oz/yd² (206.8 g/m²)",
      "Garment-dyed and pre-shrunk",
      "Reinforced neck and shoulders",
      "Double-needle stitching at armholes, sleeves, and hem"
    ]
  },
  "468513582": {
    status: "verified",
    heading: "THE TEE, NOT THE DRAMA",
    summary: "Heavyweight, soft, and made for repeat wear. This relaxed-fit, garment-dyed tee has a structured feel without feeling stiff.",
    fitFeel: ["Heavyweight", "Relaxed fit", "Garment-dyed"],
    specsTitle: "TEE SPECS",
    specs: [
      "100% ring-spun cotton",
      "6.1 oz/yd² (206.8 g/m²)",
      "Garment-dyed and pre-shrunk",
      "Reinforced neck and shoulders",
      "Double-needle stitching at armholes, sleeves, and hem"
    ]
  },
  "468520575": {
    status: "verified",
    heading: "THE TEE, LIGHTER ON PURPOSE",
    summary: "Soft, lightweight, and easy to wear. This triblend tee has a modern fit and a comfortable, worn-in feel from the first outing.",
    fitFeel: ["Lightweight", "Soft triblend", "Modern fit"],
    specsTitle: "TEE SPECS",
    specs: [
      "50% polyester, 25% combed and ring-spun cotton, 25% rayon",
      "3.4 oz/yd² (115.3 g/m²)",
      "Pre-shrunk fabric",
      "Lightweight, modern fit"
    ],
    customerNote: "Light colors may be slightly sheer in some lighting."
  },
  "468502976": {
    status: "verified",
    heading: "THE CROP, WITH A LITTLE ATTITUDE",
    summary: "Heavyweight and boxy with oversized sleeves. This garment-dyed cropped tee has a relaxed shape made for high-waisted anything.",
    fitFeel: ["Heavyweight", "Cropped and boxy", "Oversized sleeves"],
    specsTitle: "TEE SPECS",
    specs: [
      "100% ring-spun cotton",
      "6.5 oz/yd² (220 g/m²)",
      "Garment-dyed finish",
      "Cropped, boxy fit with oversized sleeves",
      "Side-seamed construction",
      "Double-needle stitching"
    ]
  },
  "468471370": {
    status: "verified",
    heading: "THE HOODIE, CUT SHORT",
    summary: "A cropped fleece hoodie with dropped shoulders and a raw hem. Soft, relaxed, and ready for whatever the group chat becomes.",
    fitFeel: ["Cropped", "Dropped shoulders", "Raw hem"],
    specsTitle: "HOODIE SPECS",
    specs: [
      "52% Airlume combed and ring-spun cotton, 48% fleece blend",
      "6.5 oz/yd² (220.39 g/m²)",
      "Cropped body with a raw hem",
      "Dropped shoulders",
      "Dyed-to-match drawcord"
    ]
  }
};

export const productPolicies = {
  shipping: {
    summary: "Standard shipping is included. Express and other available options are shown at checkout based on the delivery address.",
    details: [
      "US standard shipping: 3-4 business days after processing.",
      "US express shipping: 1-3 business days after processing.",
      "International standard shipping: 5-20 business days after processing.",
      "Canada only DDP standard: 3-5 business days after order handling, up to 12 business days for the Atlantic region.",
      "Shipping times start after the order has been processed for fulfillment."
    ]
  },
  returns: {
    summary:
      "If there is an issue with your order, email orders@funnyteesforall.com within 7 days of delivery. Include clear product photos and a short description of the problem.",
    details: [
      "Requests must be sent within 7 days after delivery.",
      "Include clear photos of the product.",
      "Describe the problem clearly so support can review the case."
    ]
  }
} as const;
