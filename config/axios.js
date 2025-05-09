import dotenv from "dotenv";

dotenv.config();

export const NAVASAN_TOKEN = process.env.NAVASAN_TOKEN;
export const SNAPP_TOKEN = process.env.SNAPP_TOKEN;

// TODO: add 18ayar as search params
export const NAVASAN_API_URL = `http://api.navasan.tech/latest/?api_key=${NAVASAN_TOKEN}`;
export const SNAPP_API_URL =
  "https://apix.snappshop.ir/vendors/v1/qPYMMA/inventory/products/excel";
