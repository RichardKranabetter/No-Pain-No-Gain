import "dotenv/config";
import { findExerciseVideos } from "./index";

async function main(): Promise<void> {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error('Nutzung: npm run match -- "Kieferöffnung CMD"');
    process.exitCode = 1;
    return;
  }

  console.log(`Suche Übungsvideos für: "${query}" ...\n`);
  const results = await findExerciseVideos(query);

  if (results.length === 0) {
    console.log("Keine Videos gefunden, die alle Filter- und Sicherheitschecks bestanden haben.");
    return;
  }

  results.forEach((video, index) => {
    console.log(`${index + 1}. ${video.title} — ${video.channelTitle}`);
    console.log(`   Dauer: ${video.durationSeconds}s | Whitelisted: ${video.isWhitelistedChannel ? "ja" : "nein"}`);
    console.log(
      `   AI-Check: bestanden=${video.aiSafetyCheck.passed} | Konfidenz=${video.aiSafetyCheck.confidenceScore.toFixed(2)}`
    );
    if (video.aiSafetyCheck.flaggedTerms.length > 0) {
      console.log(`   Geflaggte Begriffe: ${video.aiSafetyCheck.flaggedTerms.join(", ")}`);
    }
    console.log(`   Zusammenfassung: ${video.aiSafetyCheck.summary}`);
    console.log(`   Video: ${video.embedUrl}\n`);
  });
}

main().catch((error) => {
  console.error("Fehler beim Ausführen der Suche:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
