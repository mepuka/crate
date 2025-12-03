/**
 * Fetch DJ bios from KEXP website using Jina AI Reader
 *
 * Usage: bun packages/agent/scripts/fetch-dj-bios.ts
 */

import { writeFile } from "fs/promises"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const JINA_API_KEY = "jina_cde70067d7bb4b49b0030176afd106c8nLFGYMTN2EKgxJpOHVT_doLtqujS"

// DJ slugs extracted from djs.md
const DJ_SLUGS = [
  "90teen-djs",
  "abbie",
  "albina-cabrera",
  "atticus",
  "brian-foss",
  "brit-hansen",
  "cheryl-waters",
  "darek-mazzone",
  "diana-ratsamee",
  "dj-alex",
  "chilly",
  "dj-jewel",
  "dj-miss-ashley",
  "DjRiz",
  "dj-yaddy",
  "dr-west",
  "emily-fox",
  "eva",
  "evie-stokes",
  "gabriel-lopez",
  "goyri",
  "greg-vandy",
  "greta-rose",
  "hans",
  "jenn",
  "john-gilbreath",
  "john-richards",
  "jyoti-bfly",
  "kelley-stoltz",
  "kennady-quille",
  "kevin-cole",
  "kevin-sur",
  "kid-hops",
  "lace-cadence",
  "larry-mizell-jr",
  "larry-rose",
  "lisa-leclair",
  "martin-douglas",
  "mike-ramos",
  "morgan",
  "noel-brass-jr",
  "prometheus-brown",
  "reeves",
  "reverend-dollars",
  "sean",
  "sharlese",
  "stas-thee-boss",
  "supreme-la-rock",
  "tanner-ellison",
  "tory-j",
  "troy-nelson",
  "vitamin-d",
]

interface DjBio {
  slug: string
  name: string
  bio: string
  email?: string
  shows: string[]
  fetchedAt: string
}

async function fetchDjBio(slug: string): Promise<DjBio | null> {
  const url = `https://www.kexp.org/djs/${slug}/`
  const jinaUrl = `https://r.jina.ai/${url}`

  try {

    const response = await fetch(jinaUrl, {
      headers: {
        Authorization: `Bearer ${JINA_API_KEY}`,
        Accept: "text/markdown",
        "X-Return-Format": "markdown",
      },
    })

    if (!response.ok) {
      console.error(`  Failed to fetch ${slug}: ${response.status}`)
      return null
    }

    const markdown = await response.text()
    const bio = extractBio(markdown, slug)

    return bio
  } catch (error) {
    console.error(`  Error fetching ${slug}:`, error)
    return null
  }
}

function extractBio(markdown: string, slug: string): DjBio {
  // The DJ bio section starts after the profile image and has this structure:
  // ### DJ Name
  // Bio text here...
  // email@kexp.org
  // Photo by...
  // ##### Share

  // Find the DJ name - it's a ### heading that comes after the profile image
  // Look for ### followed by a capitalized name (not navigation items)
  const djSectionRegex = /!\[Image \d+: None\][^\n]*\n+###\s+([^\n]+)\n([\s\S]*?)(?=##### Share|Streaming Archive)/
  const djMatch = markdown.match(djSectionRegex)

  let name = formatSlugAsName(slug)
  let bio = ""
  let email: string | undefined

  if (djMatch) {
    name = djMatch[1].trim()
    const rawBio = djMatch[2]

    // Extract email if present
    const emailMatch = rawBio.match(/([a-zA-Z0-9._-]+@kexp\.org)/i)
    email = emailMatch?.[1]

    // Clean up the bio
    bio = rawBio
      // Remove email line
      .replace(/[a-zA-Z0-9._-]+@kexp\.org\s*/gi, "")
      // Remove "Photo by" credit lines
      .replace(/Photo by[^\n]*\n*/gi, "")
      // Remove any remaining image references
      .replace(/!\[.*?\]\(.*?\)/g, "")
      // Remove link formatting but keep text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Clean up excessive whitespace
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  } else {
    // Fallback: try simpler pattern - find ### Name followed by content until ##### Share
    const simpleRegex = /###\s+([A-Z][a-zA-Z\s\-'".]+)\n([\s\S]*?)(?=##### Share)/
    const simpleMatch = markdown.match(simpleRegex)

    if (simpleMatch) {
      name = simpleMatch[1].trim()
      const rawBio = simpleMatch[2]

      const emailMatch = rawBio.match(/([a-zA-Z0-9._-]+@kexp\.org)/i)
      email = emailMatch?.[1]

      bio = rawBio
        .replace(/[a-zA-Z0-9._-]+@kexp\.org\s*/gi, "")
        .replace(/Photo by[^\n]*\n*/gi, "")
        .replace(/!\[.*?\]\(.*?\)/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    }
  }

  // Extract shows from "Streaming Archive with" section
  const shows: string[] = []
  const archiveMatch = markdown.match(/Streaming Archive with[^\n]*\n-+\n([\s\S]*?)(?=!\[Image|$)/)
  if (archiveMatch) {
    // Extract show names from ### headings in the archive section
    const showMatches = archiveMatch[1].matchAll(/###\s+([^\n]+)/g)
    const seenShows = new Set<string>()
    for (const match of showMatches) {
      // Remove "with DJ Name" suffix and clean up
      const showName = match[1]
        .replace(/\s+with\s+.+$/i, "")
        .replace(/\s+##### .+$/, "")
        .trim()
      // Filter out bogus shows that are actually page elements
      const bogusShows = ["Media Button Title", "KEXP", "Menu", "Share"]
      if (showName && !seenShows.has(showName) && !bogusShows.includes(showName)) {
        seenShows.add(showName)
        shows.push(showName)
      }
    }
  }

  return {
    slug,
    name,
    bio,
    email,
    shows,
    fetchedAt: new Date().toISOString(),
  }
}

function formatSlugAsName(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

async function main() {
  console.log("Fetching DJ bios from KEXP...\n")

  const bios: DjBio[] = []
  const BATCH_SIZE = 5

  // Process in batches for concurrent fetching
  for (let i = 0; i < DJ_SLUGS.length; i += BATCH_SIZE) {
    const batch = DJ_SLUGS.slice(i, i + BATCH_SIZE)
    console.log(`Fetching batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(DJ_SLUGS.length / BATCH_SIZE)}: ${batch.join(", ")}`)

    const results = await Promise.all(batch.map((slug) => fetchDjBio(slug)))

    for (const bio of results) {
      if (bio) {
        bios.push(bio)
        const bioPreview = bio.bio ? bio.bio.slice(0, 60).replace(/\n/g, " ") : "(no bio)"
        const showsStr = bio.shows.length > 0 ? ` [${bio.shows.join(", ")}]` : ""
        console.log(`  ✓ ${bio.name}${showsStr}`)
        console.log(`    ${bioPreview}...`)
      }
    }
  }

  // Get directory of this script
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)
  const assetsDir = join(__dirname, "..", "assets")

  // Write to JSON file
  const jsonPath = join(assetsDir, "dj-bios.json")
  await writeFile(jsonPath, JSON.stringify(bios, null, 2))
  console.log(`\nWritten ${bios.length} bios to ${jsonPath}`)

  // Also generate a markdown summary
  const mdOutput = generateMarkdownSummary(bios)
  const mdPath = join(assetsDir, "dj-bios.md")
  await writeFile(mdPath, mdOutput)
  console.log(`Written markdown summary to ${mdPath}`)
}

function generateMarkdownSummary(bios: DjBio[]): string {
  const lines = [
    "# KEXP DJ Bios",
    "",
    `*Generated: ${new Date().toISOString()}*`,
    "",
    "---",
    "",
  ]

  for (const dj of bios.sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`## ${dj.name}`)
    lines.push("")
    if (dj.shows.length > 0) {
      lines.push(`**Shows:** ${dj.shows.join(", ")}`)
      lines.push("")
    }
    if (dj.bio) {
      lines.push(dj.bio)
      lines.push("")
    } else {
      lines.push("*No bio available*")
      lines.push("")
    }
    if (dj.email) {
      lines.push(`**Contact:** ${dj.email}`)
      lines.push("")
    }
    lines.push("---")
    lines.push("")
  }

  return lines.join("\n")
}

main().catch(console.error)
