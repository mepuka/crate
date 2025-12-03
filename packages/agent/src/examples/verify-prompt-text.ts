
import { CratePrompt } from "../prompts/system-prompt"

const mockContext = {
  currentTime: new Date("2023-10-27T10:00:00-07:00"),
  showContext: {
    programName: "The Morning Show",
    hostNames: ["John Richards"],
    tagline: "Music that matters",
    programTags: "Rock, Indie, Variety",
    startTime: "2023-10-27T07:00:00-07:00",
    id: 1,
    programId: 1,
    hostIds: [1],
    imageUri: "http://example.com/image.jpg"
  },
  recentInsights: [],
  playData: {
    id: 12345,
    airdate: "2023-10-27T10:05:00-07:00",
    artist: "The Black Tones",
    track: "The Key of Black (They Want Us Dead)",
    album: "Cobain & Cornbread",
    labels: ["Self-Released"],
    releaseDate: "2019-08-02",
    isLocal: true,
    isRequest: false,
    isLive: false,
    comment: "Seattle's own! They are playing at the Paramount next Friday. Don't miss it."
  }
}

console.log("=== SYSTEM PROMPT ===")
console.log(CratePrompt.buildSystemPrompt(mockContext))
console.log("\n=== USER MESSAGE ===")
console.log(CratePrompt.buildPlayMessage(mockContext.playData))
