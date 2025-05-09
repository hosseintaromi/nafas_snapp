// Gold price calculation and extraction utilities

/**
 * Extracts weight in grams from a product title string.
 * @param {string} title
 * @returns {number|null}
 */
export function extractWeight(title) {
  const match = title.match(/(\d+[.,]?\d*)\s*گرم/);
  if (match) {
    // Replace Persian comma with dot
    const weightStr = match[1].replace(",", ".");
    return parseFloat(weightStr);
  }
  return null;
}

/**
 * Calculates the gold product price based on market rules.
 * Tax is only applied to labor + profit, not the gold value itself.
 * @param {Object} params
 * @param {number} params.weight
 * @param {number} params.goldPricePerGram
 * @param {number} params.laborPercentage
 * @param {number} params.shopProfitPercentage
 * @param {number} params.taxPercentage
 * @returns {number}
 */
export function calculateGoldPrice({
  weight,
  goldPricePerGram,
  laborPercentage,
  shopProfitPercentage,
  taxPercentage,
}) {
  const basePrice = weight * goldPricePerGram;
  const laborCost = basePrice * (laborPercentage / 100);
  const profit = (basePrice + laborCost) * (shopProfitPercentage / 100);
  const tax = (laborCost + profit) * (taxPercentage / 100);
  const total = basePrice + laborCost + profit + tax;
  return Math.round(total);
}
