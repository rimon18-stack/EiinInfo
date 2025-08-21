const fetch = require("node-fetch");

function extractImageUrl(html) {
    const match = html && html.match(/src=['"]([^'"]+)['"]/);
    return match ? "https://emis.gov.bd" + match[1] : null;
}

function formatDate(date) {
    return date ? date.split("T")[0] : date;
}

async function callApi(urls, headers, dataArray = []) {
    if (!urls.length) return [];

    const promises = urls.map((url, index) => {
        const options = { method: dataArray[index] ? "POST" : "GET", headers };
        if (dataArray[index]) options.body = dataArray[index];
        return fetch(url, options).then(res => res.json());
    });

    return Promise.all(promises);
}

module.exports = async (req, res) => {
    const eiin = req.query.eiin;
    if (!eiin || isNaN(eiin)) {
        return res.json({
            ok: false,
            developer: "Tofazzal Hossain",
            error: "Invalid EIIN number"
        });
    }

    // 1st API Call: Get Teacher Details
    const firstApiUrl = "https://emis.gov.bd/emis/Portal/GetTeacherDetails";
    const firstApiHeaders = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded",
        "x-csrf-token": "_yrMpNmmkcA-mtrX_HUwzAdfDXs3dG6oP2fIkTgQfpDwCYht-o8lziM93DhDaSJjVpzoJsKb3SoXbKu34MqdSiW5tG14umKznfxxoCwu8BA1",
        "x-requested-with": "XMLHttpRequest"
    };
    const firstApiData = new URLSearchParams({ EIIN: eiin }).toString();
    const teacherDetailsResponse = await callApi([firstApiUrl], firstApiHeaders, [firstApiData]);

    if (!Array.isArray(teacherDetailsResponse[0]) || !teacherDetailsResponse[0].length) {
        return res.json({
            ok: false,
            developer: "Tofazzal Hossain",
            error: "No teacher data found for this EIIN"
        });
    }

    const teachers = teacherDetailsResponse[0];
    const empIds = [];
    const teacherData = {};

    teachers.forEach(t => {
        if (t.EmpId) {
            empIds.push(t.EmpId);
            teacherData[t.EmpId] = {
                image: extractImageUrl(t.Image),
                designation: t.DesignationNameBn || "N/A",
                district: t.DistrictName || "N/A",
                subject: t.SubjectName || "N/A",
                name: t.TeacherName || "N/A"
            };
        }
    });

    if (!empIds.length) {
        return res.json({
            ok: false,
            developer: "Tofazzal Hossain",
            error: "No valid employee IDs found"
        });
    }

    // 2nd API Call: Get Employee Info
    const secondApiUrl = "https://emis.gov.bd/emis/services/HRM/Public/GetEmployeeInfo";
    const secondApiHeaders = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/json",
        "x-csrf-token": "DosTvE0RNMj4AgZjlu7OaZOGenwdOGRIBDcUmuwL4QnUdJp0hHnNgb_KRv0kTSI29ytSfSAADnOnuZLBRTVAqSSXwMzCKE2SKx-kS7vqitA1",
        "x-requested-with": "XMLHttpRequest"
    };

    const urls = empIds.map(() => secondApiUrl);
    const dataArray = empIds.map(empId => JSON.stringify({ EmpText: empId }));
    const results = await callApi(urls, secondApiHeaders, dataArray);

    // Process Results
    const processedResults = results.map((result, i) => {
        const empId = empIds[i];
        if (!teacherData[empId]) return null;

        const formattedData = {};
        for (const [key, value] of Object.entries(result)) {
            if (Array.isArray(value)) {
                value.forEach(sub => {
                    for (const [subKey, subValue] of Object.entries(sub)) {
                        formattedData[subKey] = subValue.includes("T") ? formatDate(subValue) : subValue;
                    }
                });
            } else {
                formattedData[key] = value.includes("T") ? formatDate(value) : value;
            }
        }

        return {
            basic_info: teacherData[empId],
            details: formattedData
        };
    }).filter(Boolean);

    res.json({
        ok: true,
        developer: "Tofazzal Hossain",
        result: processedResults
    });
};
