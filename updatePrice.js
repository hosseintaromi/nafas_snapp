import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import ExcelJS from "exceljs";
import axios from "axios";
import readline from "readline";
import FormData from "form-data";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { NAVASAN_API_URL, SNAPP_API_URL, SNAPP_TOKEN } from "./config/axios.js";
import { extractWeight, calculateGoldPrice } from "./utils/priceCalculator.js";

dotenv.config();

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

// Get current gold price from API
async function getGoldPrice() {
  try {
    const response = await axios.get(NAVASAN_API_URL);
    const data = response.data;

    // Get 18ayar gold price from API response∏
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

      // TODO: get from telegram bot webhook
      const input = await question("قیمت هر گرم طلای 18 عیار (تومان): ");
      goldPrice = parseInt(input);
    } else {
      console.log(
        `💰 Gold price per gram (18-karat): ${goldPrice.toLocaleString()} Toman (from API)`
      );
    }

    return goldPrice;
  } catch (error) {
    console.log(`❌ خطا در اتصال به API: ${error.message}`);

    // TODO: get from telegram bot webhook
    const input = await question("قیمت هر گرم طلای 18 عیار (تومان): ");
    return parseInt(input);
  }
}

// Main function to update gold prices
async function updateGoldPricesInFile(filePath) {
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

    // TODO:
    // - add these to Gold entity in postgres
    // - when a new product is added we must add it to snapp as well using
    //   snapp api service

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
        const newPrice = calculateGoldPrice({
          weight,
          goldPricePerGram,
          laborPercentage,
          shopProfitPercentage: 7,
          taxPercentage,
        });

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
        if (cell.value === "Price (Toman)") {
          priceColIndex = colIndex;
          headerRow = rowIndex;
        } else if (cell.value === "Price By Box") {
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

      // Save the updated workbook to a new file
      const finalOutputFile = new Date().toLocaleDateString("fa");

      const outputPath = path.join(currentDir, finalOutputFile);
      await workbookExcelJS.xlsx.writeFile(outputPath);
      console.log(`✅ File with updated prices saved: ${outputPath}`);

      // Call uploadUpdatedPriceExcel with the saved file
      await uploadUpdatedPriceExcel(outputPath);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    console.error(error.stack);
  } finally {
    rl.close();
  }
}

async function uploadUpdatedPriceExcel(filePath) {
  try {
    const file = fs.createReadStream(filePath);
    const form = new FormData();
    form.append("file", file);

    const response = await axios.post(`${SNAPP_API_URL}/import/request`, {
      headers: {
        ...form.getHeaders(),
        authorization: SNAPP_TOKEN,
        "snappshop-seller-code": "qPYMMA",
      },
      body: form,
    });

    const data = await response.json();

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
    const response = await fetch(`${SNAPP_API_URL}/export/request`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "accept-language":
          "en-GB,en;q=0.9,fa-IR;q=0.8,fa;q=0.7,en-US;q=0.6,zh-CN;q=0.5,zh;q=0.4",
        authorization: SNAPP_TOKEN,
        "cache-control": "no-cache",
        "content-type": "application/json",
        origin: "https://seller.snappshop.ir",
        pragma: "no-cache",
        priority: "u=1, i",
        referer: "https://seller.snappshop.ir/",
        // "sec-ch-ua":
        // '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
        // "sec-ch-ua-mobile": "?0",
        // "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "snappshop-seller-code": "qPYMMA",
        // "user-agent":
        //   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        uuid: "5454933b-3506-450b-8103-2fe61a20d945",
        "x-client-type": "seller",
      },
    });

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
    console.error("❌ Error connecting to the server:", error);
    return {
      success: false,
      message: "Error connecting to the server: " + error.message,
      error: error,
    };
  }
}

async function checkStatus() {
  try {
    const response = await axios.get(`${SNAPP_API_URL}/export`, {
      headers: {
        accept: "application/json",
        "accept-language":
          "en-GB,en;q=0.9,fa-IR;q=0.8,fa;q=0.7,en-US;q=0.6,zh-CN;q=0.5,zh;q=0.4",
        authorization: SNAPP_TOKEN,
        "snappshop-seller-code": "qPYMMA",
      },
    });

    const data = response.data;

    if (data.status === true && data.data.status === "processing") {
      console.log("Wait! I'll check again in 1 minute...");
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
        updateGoldPricesInFile(filePath);
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
//upload file to snapp => done
//add commition and fee => done
//change logs to en => done
//remove extra question
//add auto login for snapp
//add telegram hook for gold price and report
