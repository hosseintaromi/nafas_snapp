const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const ExcelJS = require("exceljs");
const axios = require("axios");
const readline = require("readline");
const FormData = require("form-data");
const fetch = require("node-fetch");
require("dotenv").config(); // Load .env file

const NAVASAN_TOKEN = process.env.NAVASAN_TOKEN;
const SNAPP_TOKEN = process.env.SNAPP_TOKEN;

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
  const basePrice = weight * goldPricePerGram;
  const laborCost = basePrice * (laborPercentage / 100);
  const subtotal = basePrice + laborCost;
  const shopProfit = subtotal * (shopProfitPercentage / 100);
  const subtotalWithProfit = subtotal + shopProfit;
  const tax = subtotalWithProfit * (taxPercentage / 100);
  const totalPrice = subtotalWithProfit + tax;
  return Math.round(totalPrice);
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
        "❌ خطا در دریافت قیمت طلا از API. از قیمت پیش‌فرض استفاده می‌شود."
      );
      const input = await question("قیمت هر گرم طلای 18 عیار (تومان): ");
      goldPrice = parseInt(input);
    } else {
      console.log(
        `💰 قیمت هر گرم طلای 18 عیار: ${goldPrice.toLocaleString()} تومان (از API)`
      );
    }

    return goldPrice;
  } catch (error) {
    console.log(`❌ خطا در اتصال به API: ${error.message}`);
    const input = await question("قیمت هر گرم طلای 18 عیار (تومان): ");
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

    console.log("\n===== محاسبه قیمت‌های جدید =====");
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
        console.log(`   وزن: ${weight} گرم`);
        console.log(`   درصد اجرت: ${laborPercentage}%`);
        console.log(`   درصد مالیات: ${taxPercentage}%`);

        if (oldPrice !== undefined) {
          console.log(`   قیمت قبلی: ${oldPrice.toLocaleString()} تومان`);
          console.log(`   قیمت جدید: ${newPrice.toLocaleString()} تومان`);

          // Calculate difference
          const diff = newPrice - oldPrice;
          const diffPercent = oldPrice !== 0 ? (diff / oldPrice) * 100 : 0;
          const diffSign = diff >= 0 ? "+" : "";
          console.log(
            `   تغییر: ${diffSign}${diff.toLocaleString()} تومان (${diffSign}${diffPercent.toFixed(
              1
            )}%)`
          );
        } else {
          console.log(`   قیمت جدید: ${newPrice.toLocaleString()} تومان`);
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

      // Save the updated workbook to a new file
      const outputFile = await question(
        "نام فایل خروجی را وارد کنید (با پسوند .xlsx): "
      );
      const finalOutputFile = outputFile.endsWith(".xlsx")
        ? outputFile
        : `${outputFile}.xlsx`;

      const outputPath = path.join(currentDir, finalOutputFile);
      await workbookExcelJS.xlsx.writeFile(outputPath);
      console.log(`✅ فایل با قیمت‌های به‌روز شده ذخیره شد: ${outputPath}`);

      // Call postNewPrice with the saved file
      await postNewPrice(outputPath);
    }
  } catch (error) {
    console.log(`❌ خطا: ${error.message}`);
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

    const response = await fetch(
      "https://apix.snappshop.ir/vendors/v1/qPYMMA/inventory/products/excel/import/request",
      {
        method: "POST",
        headers: {
          ...form.getHeaders(),
          authorization: SNAPP_TOKEN,
          "snappshop-seller-code": "qPYMMA",
        },
        body: form,
      }
    );

    const data = await response.json();

    if (response.ok) {
      console.log("✅ فایل با موفقیت ارسال شد!");
    } else {
      console.error("❌ خطا در ارسال فایل:", data);
    }
  } catch (error) {
    console.error("❌ خطا در ارسال فایل:", error.message);
  }
}

async function requestNewExcelFile() {
  try {
    const response = await fetch(
      "https://apix.snappshop.ir/vendors/v1/qPYMMA/inventory/products/excel/export/request",
      {
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
          "sec-ch-ua":
            '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"macOS"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-site",
          "snappshop-seller-code": "qPYMMA",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          uuid: "5454933b-3506-450b-8103-2fe61a20d945",
          "x-client-type": "seller",
        },
      }
    );

    const data = await response.json();

    if (data.status === true) {
      console.log("درخواست فایل اکسل با موفقیت ثبت شد");
      checkStatus();
      return {
        success: true,
        message: "درخواست فایل اکسل با موفقیت ثبت شد",
        data: data,
      };
    } else if (data.code === 111006) {
      console.log("شما قبلا یک درخواست ثبت کرده اید. ادامه مراحل بعدی...");
      checkStatus();
      return {
        success: true,
        message: "درخواست قبلا ثبت شده است",
        data: data,
      };
    } else {
      console.error("خطا در ثبت درخواست:", data.message);
      return {
        success: false,
        message: data.message || "خطای نامشخص",
        data: data,
      };
    }
  } catch (error) {
    console.error("خطا در ارتباط با سرور:", error);
    return {
      success: false,
      message: "خطا در ارتباط با سرور: " + error.message,
      error: error,
    };
  }
}

async function checkStatus() {
  try {
    const response = await axios.get(
      "https://apix.snappshop.ir/vendors/v1/qPYMMA/inventory/products/excel/export",
      {
        headers: {
          accept: "application/json",
          "accept-language":
            "en-GB,en;q=0.9,fa-IR;q=0.8,fa;q=0.7,en-US;q=0.6,zh-CN;q=0.5,zh;q=0.4",
          authorization: SNAPP_TOKEN,
          "snappshop-seller-code": "qPYMMA",
        },
      }
    );

    const data = response.data;

    console.log(data);
    if (data.status === true && data.data.status == "processing") {
      console.log("Wait! I'll check again in 1 minute...");
      setTimeout(() => {
        checkStatus();
      }, 60000);
    } else if (data.status === true && data.data.status == "processed") {
      console.log("File is ready for download:", data.data.file);

      // دانلود فایل
      const fileUrl = data.data.file;
      const filePath = path.join(__dirname, "inventory_products.xlsx"); // مسیر فایل در روت پروژه

      const fileResponse = await axios({
        url: fileUrl,
        method: "GET",
        headers: {
          authorization: SNAPP_TOKEN,
          "snappshop-seller-code": "qPYMMA",
        },
        responseType: "stream", // نوع پاسخ به‌صورت استریم
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
//upload file to snapp => done
//add commition and fee => done
//change logs to en
//add telegram hook for gold price and report
//add auto login for snapp
//remove extra question
