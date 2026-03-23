require("dotenv").config();
const xlsx = require("xlsx");
const { CosmosClient } = require("@azure/cosmos");

const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
});

const database = client.database(process.env.COSMOS_DATABASE);
const container = database.container(process.env.COSMOS_CONTAINER);

async function importExcel() {
  try {
    const workbook = xlsx.readFile("Harmony Network.xlsx");

    // בוחרים את ה-sheet הרצוי
    console.log(workbook.SheetNames);
    const sheetName = "Volunteers - Dec25";
    
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      throw new Error(`Sheet '${sheetName}' not found`);
    }

    const rows = xlsx.utils.sheet_to_json(worksheet);

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];

      const participant = {
        id: `p${index + 1}`,
        event_id: "event1",
        participantNumber: index + 1, // שורה 2 = 1
        fullName: row["الاسم"] || "",
        profileLink: row["الرابط"] || "",
        imageUrl: row["Unnamed: 1"] || "",
        gender: row["Gender"] || "",
        birthDate: row["Birth Date"] || "",
        originCountry: row["Origin Country"] || "",
        currentCountry: row["Current Country"] || "",
        careerType: row["Career Type"] || "",
        jobTitle: row["Job Title"] || "",
        academicResume: row["Academic Resume"] || "",
        professionalResume: row["Professional Resume"] || "",
        personalResume: row["Personal Resume"] || "",
        newSkills: row["New Skills"] || "",
        funFact: row["Fun Fact"] || "",
        saved: [],
        met: [],
        matches: []
      };

      await container.items.upsert(participant);
    }

    console.log(`Imported ${rows.length} participants successfully`);
  } catch (error) {
    console.error("Import failed:", error.message);
  }
}

importExcel();