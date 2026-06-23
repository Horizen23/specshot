/** @type {import('specshot').SpecshotConfig} */
export default {
  coreDir: "src/lib/api/core",
  providerDir: "src/lib/api/app",
  // `openapiUrl` รองรับ 2 รูปแบบ:
  // 1. URL ของ Backend (เช่น "http://localhost:3000/openapi.json") เพื่อให้ระบบดูด Spec มา Gen โค้ดได้
  // 2. ไฟล์ในเครื่อง (เช่น "./openapi.json") หากโหลด Spec เก็บไว้ในโปรเจกต์
  openapiUrl: "./openapi.json",
  integration: "none",
  interceptors: ["bearer","logger"],

  // Custom Plugins for Faker Mock Data
  plugins: [
    // {
    //   name: "example-plugin",
    //   resolveFaker(context) {
    //     // Custom logic to return a mock value
    //   }
    // }
  ],
};
