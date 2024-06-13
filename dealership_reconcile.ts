import { parse } from "https://deno.land/std@0.104.0/encoding/csv.ts";
import { serve } from "https://deno.land/std@0.104.0/http/server.ts";

async function fetchCsv(url: string): Promise<any[]> {
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`Failed to fetch URL: ${url}, Status: ${response.status}`);
    return [];
  }
  const csvText = await response.text();
  const csvData = await parse(csvText, { skipFirstRow: true });
  return csvData as any[];
}

async function processDealership(vinsolutionsUrl: string, coxautomotiveUrl: string, dealerId: string) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json",
  };

  try {
    const vinsolutionsData = await fetchCsv(vinsolutionsUrl);
    const vinsolutionsDataUsed = vinsolutionsData.filter(row => row.Type === 'Used');
    const vinsolutionsVins = new Set(vinsolutionsDataUsed.map(row => row.VIN));

    const coxautomotiveData = await fetchCsv(coxautomotiveUrl);
    const coxautomotiveDataUsed = coxautomotiveData.filter(row => row.type === 'Used' && row.dealer_id === dealerId);
    const coxautomotiveVins = new Set(coxautomotiveDataUsed.map(row => row.vin));

    const commonVins = [...coxautomotiveVins].filter(vin => vinsolutionsVins.has(vin));
    const uniqueCoxautomotiveVins = [...coxautomotiveVins].filter(vin => !vinsolutionsVins.has(vin));
    const uniqueVinsolutionsVins = [...vinsolutionsVins].filter(vin => !coxautomotiveVins.has(vin));

    const results = [];

    for (const vin of commonVins) {
      results.push({ VIN: vin, Result: "Appearing" });
    }

    const uniqueVins = uniqueCoxautomotiveVins.concat(uniqueVinsolutionsVins);
    for (const vin of uniqueVins) {
      const apiUrl = `https://cws.gm.com/vs-cws/vehshop/v2/vehicle?vin=${vin}&postalCode=48640&locale=en_US`;
      const apiResponse = await fetch(apiUrl, { headers });
      if (!apiResponse.ok) {
        console.error(`Failed API request for VIN: ${vin}, Status: ${apiResponse.status}`);
        results.push({ VIN: vin, Result: "API request failed" });
        continue;
      }
      const apiData = await apiResponse.json();

      if (apiData.mathBox?.recallInfo?.includes("This vehicle is temporarily unavailable")) {
        results.push({ VIN: vin, Result: "Vehicle with Recall" });
        continue;
      }

      const inventoryStatus = apiData.inventoryStatus?.name;
      if (inventoryStatus) {
        if (inventoryStatus === "Rtl_Intrans" && uniqueCoxautomotiveVins.includes(vin)) {
          results.push({ VIN: vin, Result: "In Transit - Not expected in HomeNet" });
        } else if (inventoryStatus === "EligRtlStkCT") {
          results.push({ VIN: vin, Result: "Courtesy Vehicle" });
        } else {
          results.push({ VIN: vin, Result: `Other Inventory Status: ${inventoryStatus}` });
        }
      } else {
        if (uniqueCoxautomotiveVins.includes(vin)) {
          results.push({ VIN: vin, Result: "Exclusive to Dealer.com Website" });
        } else {
          results.push({ VIN: vin, Result: "Exclusive to HomeNet" });
        }
      }
    }

    console.log(results);
  } catch (error) {
    console.error(`Error processing dealership: ${dealerId}`, error);
  }
}

async function main() {
  const data = [
    // Replace this with the actual data or fetch from a source
    {
      vinsolutionsUrl: "https://feeds.amp.auto/feeds/vinsolutions/garberchevroletlinwood-10117.csv",
      coxautomotiveUrl: "https://feeds.amp.auto/feeds/coxautomotive/garberchevroletlinwood.csv",
      dealerId: "garberchevroletlinwood"
    },
    // Add more dealership data as needed
  ];

  for (const dealership of data) {
    await processDealership(dealership.vinsolutionsUrl, dealership.coxautomotiveUrl, dealership.dealerId);
  }
}

if (import.meta.main) {
  main();
}
