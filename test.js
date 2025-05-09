function calculateGoldPrice(
  weight,
  goldPricePerGram,
  laborPercentage,
  shopProfitPercentage,
  taxPercentage
) {
  const basePrice = weight * goldPricePerGram;
  const laborCost = basePrice * (laborPercentage / 100);
  const subtotal = basePrice + laborCost;
  const shopProfit = subtotal * (shopProfitPercentage / 100);
  const subtotalWithProfit = subtotal + shopProfit;
  const tax = subtotalWithProfit * (taxPercentage / 100);
  const totalPrice = subtotalWithProfit + tax;
  console.log(Math.round(totalPrice));
}

calculateGoldPrice(0.98, 6809180, 23, 7, 10);
