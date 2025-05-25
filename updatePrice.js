const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const ExcelJS = require("exceljs");
const axios = require("axios");
const readline = require("readline");
const FormData = require("form-data");
const fetch = require("node-fetch");
require("dotenv").config(); // Load .env file
const moment = require("jalali-moment");

const NAVASAN_TOKEN = process.env.NAVASAN_TOKEN;
const SNAPP_TOKEN = process.env.SNAPP_TOKEN;
const SNAPP_URL =
  "https://apix.snappshop.ir/vendors/v1/qPYMMA/inventory/products/";

// Setup readline interface for input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Promisify the readline question
function question(text) {
  return new Promise((resolve) => {
    rl.question(text, resolve);
  });
}

// Extract weight from product title
function extractWeight(title) {
  const match = title.match(/(\d+[.,]?\d*)\s*گرم/);
  if (match) {
    // Replace Persian comma with dot
    const weightStr = match[1].replace(",", ".");
    return parseFloat(weightStr);
  }
  return null;
}

// Calculate the price based on weight, gold price, labor and tax percentages
function calculateGoldPrice(
  weight,
  goldPricePerGram,
  laborPercentage,
  shopProfitPercentage,
  taxPercentage
) {
  goldPricePerGram = goldPricePerGram + 200000;
  console.log("goldPricePerGram", goldPricePerGram);
  const basePrice = weight * goldPricePerGram;
  const laborCost = basePrice * (laborPercentage / 100);
  const subtotal = basePrice + laborCost;
  const shopProfit = subtotal * (shopProfitPercentage / 100);
  const subtotalWithProfit = subtotal + shopProfit;
  const tax = subtotalWithProfit * (taxPercentage / 100);
  const totalPrice = subtotalWithProfit + tax;
  const totalWithSnappPercentage = totalPrice * (4 / 100);
  const finalPrice = totalPrice + totalWithSnappPercentage;

  return Math.round(finalPrice);
}

// Get current gold price from API
async function getGoldPrice() {
  const url = `http://api.navasan.tech/latest/?api_key=${NAVASAN_TOKEN}`;

  try {
    const response = await axios.get(url);
    const data = response.data;

    // Get 18ayar gold price from API response
    let goldPrice = 0;
    if (data["18ayar"] && data["18ayar"].value) {
      goldPrice = parseInt(data["18ayar"].value);
    }

    if (goldPrice === 0) {
      console.log(
        "❌ Error: Failed to retrieve gold price from API. Using default price."
      );
      const input = await question(
        "⚙️ Enter the price per gram for 18-karat gold (in Tomans): "
      );
      goldPrice = parseInt(input);
    } else {
      console.log(
        `💰 Gold price per gram (18-karat): ${goldPrice.toLocaleString()} Toman (from API)`
      );
    }

    return goldPrice;
  } catch (error) {
    console.log(`❌ Error: Failed to connect to API - ${error.message}`);
    const input = await question(
      "⚙️ Enter the price per gram for 18-karat gold (in Tomans): "
    );
    return parseInt(input);
  }
}

// Main function to update gold prices
async function updateGoldPrices(filePath) {
  console.log(filePath);
  try {
    // Get the directory of the current script
    const currentDir = __dirname;

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log(`❌ File not found: ${filePath}`);
      rl.close();
      return;
    }

    // Get gold price from API
    const goldPricePerGram = await getGoldPrice();

    // Read Excel file to get data
    console.log(`📊 Reading Excel file: ${filePath}`);
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    const productConfigs = {
      MOv6kw: 16,
      exLEv4: 18,
      za254K: 22,
      a8bOMv: 18,
      Z4bQR3: 24,
      b1byEJ: 18,
      dJbV8l: 22,
      X9brx7: 30,
    };

    // Calculate new prices
    const newPrices = {};

    console.log("\n===== Calculating New Prices =====");
    for (const row of data) {
      const productId = row["ID"];
      const title = row["عنوان کالا"];
      const oldPrice = row["قیمت به تومان"];

      // Extract weight from title
      const weight = extractWeight(title);

      // Get labor percentage from configs or use default
      const laborPercentage = productConfigs[productId] || 20;
      // Tax is 10% for all products
      const taxPercentage = 10;

      // Calculate new price if weight is available
      if (weight) {
        const newPrice = calculateGoldPrice(
          weight,
          goldPricePerGram,
          laborPercentage,
          7,
          taxPercentage
        );

        // Store new price
        newPrices[productId] = newPrice;

        // Display calculation
        console.log(`${title}`);
        console.log(`   📦 Weight: ${weight} grams`);
        console.log(`   🛠️ Labor Percentage: ${laborPercentage}%`);
        console.log(`   💵 Tax Percentage: ${taxPercentage}%`);

        if (oldPrice !== undefined) {
          console.log(`   💰 Old Price: ${oldPrice.toLocaleString()} Toman`);
          console.log(`   🆕 New Price: ${newPrice.toLocaleString()} Toman`);

          // Calculate difference
          const diff = newPrice - oldPrice;
          const diffPercent = oldPrice !== 0 ? (diff / oldPrice) * 100 : 0;
          const diffSign = diff >= 0 ? "+" : "";
          console.log(
            `   🔁 Change: ${diffSign}${diff.toLocaleString()} Toman (${diffSign}${diffPercent.toFixed(
              1
            )}%)`
          );
        } else {
          console.log(`   🆕 New Price: ${newPrice.toLocaleString()} Toman`);
        }

        console.log();
      }
    }

    // Now load the workbook with ExcelJS to preserve formatting
    const workbookExcelJS = new ExcelJS.Workbook();
    await workbookExcelJS.xlsx.readFile(filePath);
    const worksheet1 = workbookExcelJS.getWorksheet(1);

    // Find the columns for price
    let headerRow = null;
    let priceColIndex = null;
    let priceBoxColIndex = null;
    let idColIndex = null;

    worksheet1.eachRow((row, rowIndex) => {
      row.eachCell((cell, colIndex) => {
        if (cell.value === "قیمت به تومان") {
          priceColIndex = colIndex;
          headerRow = rowIndex;
        } else if (cell.value === "قیمت بای باکس") {
          priceBoxColIndex = colIndex;
        } else if (cell.value === "ID") {
          idColIndex = colIndex;
        }
      });
    });

    if (priceColIndex && headerRow && idColIndex) {
      // Update the prices in the sheet
      for (
        let rowIdx = headerRow + 1;
        rowIdx <= worksheet1.rowCount;
        rowIdx++
      ) {
        const productId = worksheet1.getRow(rowIdx).getCell(idColIndex).value;
        if (productId in newPrices) {
          // Update price
          worksheet1.getRow(rowIdx).getCell(priceColIndex).value =
            newPrices[productId];
          if (priceBoxColIndex) {
            worksheet1.getRow(rowIdx).getCell(priceBoxColIndex).value =
              newPrices[productId];
          }
        }
      }

      const today = moment().locale("fa").format("jMMMD");
      const finalOutputFile = `updated_prices_${today}.xlsx`;
      console.log(finalOutputFile);
      const outputPath = path.join(currentDir, finalOutputFile);
      await workbookExcelJS.xlsx.writeFile(outputPath);
      console.log(`✅ File with updated prices saved: ${outputPath}`);

      // Call postNewPrice with the saved file
      await postNewPrice(outputPath);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    console.error(error.stack);
  } finally {
    rl.close();
  }
}

async function postNewPrice(filePath) {
  try {
    const file = fs.createReadStream(filePath);
    const form = new FormData();
    form.append("file", file);

    const response = await axios.post(
      `${SNAPP_URL}excel/import/request`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          authorization: SNAPP_TOKEN,
          "snappshop-seller-code": "qPYMMA",
        },
      }
    );

    if (response.status === 200) {
      console.log("✅ File has been successfully sent!");
    } else {
      console.error("❌ Error sending file:", response.data);
    }
  } catch (error) {
    console.error("❌ Error sending file:", error.message);
  }
}

async function requestNewExcelFile() {
  try {
    const response = await axios.post(
      `${SNAPP_URL}excel/export/request`,
      {},
      {
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: SNAPP_TOKEN,
          "snappshop-seller-code": "qPYMMA",
          uuid: "5454933b-3506-450b-8103-2fe61a20d945",
          "x-client-type": "seller",
        },
      }
    );

    const data = response.data;

    if (data.status === true) {
      console.log("✅ Excel file request has been successfully registered!");
      checkStatus();
      return {
        success: true,
        message: "Excel file request has been successfully registered!",
        data: data,
      };
    } else if (data.code === 111006) {
      console.log(
        "⚠️ You have already submitted a request. Proceeding to the next steps..."
      );
      checkStatus();
      return {
        success: true,
        message: "Request has already been submitted.",
        data: data,
      };
    } else {
      console.error("❌ Error registering the request:", data.message);
      return {
        success: false,
        message: data.message || "Unknown error",
        data: data,
      };
    }
  } catch (error) {
    if (data.code === 111006) {
      console.log(
        "⚠️ You have already submitted a request. Proceeding to the next steps..."
      );
      checkStatus();
      return {
        success: true,
        message: "Request has already been submitted.",
        data: data,
      };
    }
    console.error("❌ Error connecting to the server:", error);
    return {
      success: false,
      message: "Error connecting to the server: " + error.message,
      error: error,
    };
  }
}
var tryTime = 0;
async function checkStatus() {
  try {
    const response = await axios.get(`${SNAPP_URL}excel/export`, {
      headers: {
        accept: "application/json",
        authorization: SNAPP_TOKEN,
        "snappshop-seller-code": "qPYMMA",
      },
    });

    const data = response.data;

    if (data.status === true && data.data.status === "processing") {
      tryTime++;
      console.log(`Wait! I'll check again in 1 minute for ${tryTime} time`);
      setTimeout(() => {
        checkStatus();
      }, 60000);
    } else if (data.status === true && data.data.status === "processed") {
      console.log("File is ready for download:", data.data.file);

      const fileUrl = data.data.file;
      const filePath = path.join(__dirname, "inventory_products.xlsx");

      const fileResponse = await axios({
        url: fileUrl,
        method: "GET",
        headers: {
          authorization: SNAPP_TOKEN,
          "snappshop-seller-code": "qPYMMA",
        },
        responseType: "stream",
      });

      const writer = fs.createWriteStream(filePath);
      fileResponse.data.pipe(writer);

      writer.on("finish", () => {
        console.log("File downloaded successfully:", filePath);
        updateGoldPrices(filePath);
      });

      writer.on("error", (err) => console.error("Download failed:", err));
    } else {
      console.log("Error checking file status:", data.message);
      return {
        success: false,
        message: data.message || "Unknown error",
      };
    }
  } catch (error) {
    console.log("Error in API connection:", error.message);
    return {
      success: false,
      message: "Error in API connection: " + error.message,
    };
  }
}

function main() {
  requestNewExcelFile();
}

main();

//todos
//remove extra question
//add auto login for snapp
//add telegram hook for gold price and report
