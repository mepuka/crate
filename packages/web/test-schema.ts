import { Schema } from "effect"
import { PlayResult, TimelineResponse } from "./src/domain/Play"

// Test data from actual API response
const testApiResponse = {
  "results": [{
    "id": 3576859,
    "artist": "Talking Heads",
    "song": "Life During Wartime",
    "similarity": 0.0,
    "album": "Fear of Music",
    "airdate": "2025-11-11T14:18:29-08:00",
    "labels": ["Rhino"],
    "rotation_status": null,
    "is_local": false,
    "is_live": false,
    "is_request": false,
    "comment": null,
    "show": 65082,
    "image_uri": "https://ia801604.us.archive.org/3/items/mbid-621b308e-ef79-4c7a-aa87-1f47885a709b/mbid-621b308e-ef79-4c7a-aa87-1f47885a709b-9312152547_thumb500.jpg",
    "thumbnail_uri": "https://dn710605.ca.archive.org/0/items/mbid-621b308e-ef79-4c7a-aa87-1f47885a709b/mbid-621b308e-ef79-4c7a-aa87-1f47885a709b-9312152547_thumb250.jpg",
    "artist_mbid": ["a94a7155-c79d-4409-9fcf-220cb0e4dc3a"],
    "recording_mbid": "e2209423-291a-46ea-b3e9-935be1a5b41f",
    "release_mbid": "621b308e-ef79-4c7a-aa87-1f47885a709b",
    "release_group_mbid": "f378dcb1-841b-3be1-9d96-779036562de1"
  }],
  "next_cursor": "MjAyNS0xMS0xMVQxNDoxODoyOS0wODowMDozNTc2ODU5",
  "has_more": true,
  "query_time_ms": 0.7419586181640625,
  "total_count": null,
  "anchor_position": null
}

// Test schema validation
const decode = Schema.decodeUnknownSync(TimelineResponse)

try {
  const result = decode(testApiResponse)
  console.log("✅ Schema validation PASSED")
  console.log("Decoded result:", result)
} catch (error) {
  console.error("❌ Schema validation FAILED")
  console.error("Error:", error)
}
