import { describe, it, expect } from "vitest"
import * as SemanticPredicate from "../../src/kexp/predicate.js"
import { PlayResult } from "../../src/faiss/schemas.js"
import { DateTime, Duration } from "effect"

// Helper to create a mock PlayResult
const makePlay = (overrides: Partial<typeof PlayResult.Type> = {}): typeof PlayResult.Type => ({
  id: 1,
  artist: "The Beatles",
  song: "Hey Jude",
  similarity: 1.0,
  album: "Hey Jude",
  airdate: new Date(),
  release_date: new Date(),
  labels: ["Apple"],
  rotation_status: "Heavy",
  is_local: false,
  is_live: false,
  is_request: false,
  comment: null,
  show: 123,
  image_uri: null,
  thumbnail_uri: null,
  artist_mbid: [],
  recording_mbid: null,
  release_mbid: null,
  release_group_mbid: null,
  ...overrides
})

describe("SemanticPredicate", () => {
  it("artist predicate", () => {
    const p = SemanticPredicate.artist("Beatles")
    expect(p.description).toBe('artist name contains "Beatles"')
    expect(p.check(makePlay({ artist: "The Beatles" }))).toBe(true)
    expect(p.check(makePlay({ artist: "Rolling Stones" }))).toBe(false)
  })

  it("song predicate", () => {
    const p = SemanticPredicate.song("Jude")
    expect(p.description).toBe('song title contains "Jude"')
    expect(p.check(makePlay({ song: "Hey Jude" }))).toBe(true)
    expect(p.check(makePlay({ song: "Let It Be" }))).toBe(false)
  })

  it("album predicate", () => {
    const p = SemanticPredicate.album("Jude")
    expect(p.description).toBe('album name contains "Jude"')
    expect(p.check(makePlay({ album: "Hey Jude" }))).toBe(true)
    expect(p.check(makePlay({ album: "Abbey Road" }))).toBe(false)
    expect(p.check(makePlay({ album: null }))).toBe(false)
  })

  it("combinators: and", () => {
    const p1 = SemanticPredicate.artist("Beatles")
    const p2 = SemanticPredicate.song("Jude")
    const combined = SemanticPredicate.and(p1, p2)

    expect(combined.description).toBe('(artist name contains "Beatles" and song title contains "Jude")')
    expect(combined.check(makePlay({ artist: "The Beatles", song: "Hey Jude" }))).toBe(true)
    expect(combined.check(makePlay({ artist: "The Beatles", song: "Let It Be" }))).toBe(false)
    expect(combined.check(makePlay({ artist: "Rolling Stones", song: "Hey Jude" }))).toBe(false)
  })

  it("combinators: or", () => {
    const p1 = SemanticPredicate.artist("Beatles")
    const p2 = SemanticPredicate.artist("Stones")
    const combined = SemanticPredicate.or(p1, p2)

    expect(combined.description).toBe('(artist name contains "Beatles" or artist name contains "Stones")')
    expect(combined.check(makePlay({ artist: "The Beatles" }))).toBe(true)
    expect(combined.check(makePlay({ artist: "The Rolling Stones" }))).toBe(true)
    expect(combined.check(makePlay({ artist: "The Who" }))).toBe(false)
  })


  it("combinators: not", () => {
    const p = SemanticPredicate.not(SemanticPredicate.isLive)
    expect(p.description).toBe('not (is a live performance)')
    expect(p.check(makePlay({ is_live: false }))).toBe(true)
    expect(p.check(makePlay({ is_live: true }))).toBe(false)
  })

  describe("Temporal Predicates", () => {
    it("after", () => {
      const date = DateTime.unsafeFromDate(new Date("2023-01-01T12:00:00Z"))
      const p = SemanticPredicate.after(date)
      expect(p.description).toBe(`aired after ${DateTime.formatIso(date)}`)
      expect(p.check(makePlay({ airdate: new Date("2023-01-02") }))).toBe(true)
      expect(p.check(makePlay({ airdate: new Date("2022-12-31") }))).toBe(false)
    })

    it("before", () => {
      const date = DateTime.unsafeFromDate(new Date("2023-01-01T12:00:00Z"))
      const p = SemanticPredicate.before(date)
      expect(p.description).toBe(`aired before ${DateTime.formatIso(date)}`)
      expect(p.check(makePlay({ airdate: new Date("2022-12-31") }))).toBe(true)
      expect(p.check(makePlay({ airdate: new Date("2023-01-02") }))).toBe(false)
    })

    it("between", () => {
      const start = DateTime.unsafeFromDate(new Date("2023-01-01T00:00:00Z"))
      const end = DateTime.unsafeFromDate(new Date("2023-01-02T00:00:00Z"))
      const p = SemanticPredicate.between(start, end)
      expect(p.description).toBe(`aired between ${DateTime.formatIso(start)} and ${DateTime.formatIso(end)}`)
      expect(p.check(makePlay({ airdate: new Date("2023-01-01T12:00:00Z") }))).toBe(true)
      expect(p.check(makePlay({ airdate: new Date("2022-12-31") }))).toBe(false)
      expect(p.check(makePlay({ airdate: new Date("2023-01-03") }))).toBe(false)
    })

    it("releasedAfter", () => {
      const date = DateTime.unsafeFromDate(new Date("2000-01-01"))
      const p = SemanticPredicate.releasedAfter(date)
      expect(p.description).toBe(`released after ${DateTime.formatIso(date)}`)
      expect(p.check(makePlay({ release_date: new Date("2005-01-01") }))).toBe(true)
      expect(p.check(makePlay({ release_date: new Date("1999-01-01") }))).toBe(false)
      expect(p.check(makePlay({ release_date: null }))).toBe(false)
    })
  })

  describe("MBID Predicates", () => {
    it("hasArtistMbid", () => {
      const p = SemanticPredicate.hasArtistMbid("mbid-123")
      expect(p.description).toBe('has artist MBID "mbid-123"')
      expect(p.check(makePlay({ artist_mbid: ["mbid-123", "mbid-456"] }))).toBe(true)
      expect(p.check(makePlay({ artist_mbid: ["mbid-789"] }))).toBe(false)
      expect(p.check(makePlay({ artist_mbid: [] }))).toBe(false)
    })

    it("hasRecordingMbid", () => {
      const p = SemanticPredicate.hasRecordingMbid("mbid-rec")
      expect(p.description).toBe('has recording MBID "mbid-rec"')
      expect(p.check(makePlay({ recording_mbid: "mbid-rec" }))).toBe(true)
      expect(p.check(makePlay({ recording_mbid: "other" }))).toBe(false)
      expect(p.check(makePlay({ recording_mbid: null }))).toBe(false)
    })

    it("hasReleaseMbid", () => {
      const p = SemanticPredicate.hasReleaseMbid("mbid-rel")
      expect(p.description).toBe('has release MBID "mbid-rel"')
      expect(p.check(makePlay({ release_mbid: "mbid-rel" }))).toBe(true)
      expect(p.check(makePlay({ release_mbid: "other" }))).toBe(false)
      expect(p.check(makePlay({ release_mbid: null }))).toBe(false)
    })


    it("hasReleaseGroupMbid", () => {
      const p = SemanticPredicate.hasReleaseGroupMbid("mbid-rg")
      expect(p.description).toBe('has release group MBID "mbid-rg"')
      expect(p.check(makePlay({ release_group_mbid: "mbid-rg" }))).toBe(true)
      expect(p.check(makePlay({ release_group_mbid: "other" }))).toBe(false)
      expect(p.check(makePlay({ release_group_mbid: null }))).toBe(false)
    })

    it("hasAnyArtistMbid", () => {
      const p = SemanticPredicate.hasAnyArtistMbid
      expect(p.description).toBe("has any artist MBID")
      expect(p.check(makePlay({ artist_mbid: ["mbid-123"] }))).toBe(true)
      expect(p.check(makePlay({ artist_mbid: [] }))).toBe(false)
    })

    it("hasAnyRecordingMbid", () => {
      const p = SemanticPredicate.hasAnyRecordingMbid
      expect(p.description).toBe("has any recording MBID")
      expect(p.check(makePlay({ recording_mbid: "mbid-rec" }))).toBe(true)
      expect(p.check(makePlay({ recording_mbid: null }))).toBe(false)
    })

    it("hasAnyReleaseMbid", () => {
      const p = SemanticPredicate.hasAnyReleaseMbid
      expect(p.description).toBe("has any release MBID")
      expect(p.check(makePlay({ release_mbid: "mbid-rel" }))).toBe(true)
      expect(p.check(makePlay({ release_mbid: null }))).toBe(false)
    })


    it("hasAnyReleaseGroupMbid", () => {
      const p = SemanticPredicate.hasAnyReleaseGroupMbid
      expect(p.description).toBe("has any release group MBID")
      expect(p.check(makePlay({ release_group_mbid: "mbid-rg" }))).toBe(true)
      expect(p.check(makePlay({ release_group_mbid: null }))).toBe(false)
    })
  })

  describe("Label Predicates", () => {
    it("hasLabel", () => {
      const p = SemanticPredicate.hasLabel("Sub Pop")
      expect(p.description).toBe('released on label "Sub Pop"')
      expect(p.check(makePlay({ labels: ["Sub Pop", "Matador"] }))).toBe(true)
      expect(p.check(makePlay({ labels: ["sub pop"] }))).toBe(true) // Case insensitive
      expect(p.check(makePlay({ labels: ["Merge"] }))).toBe(false)
      expect(p.check(makePlay({ labels: [] }))).toBe(false)
    })

    it("hasAnyLabel", () => {
      const p = SemanticPredicate.hasAnyLabel
      expect(p.description).toBe("has any label")
      expect(p.check(makePlay({ labels: ["Sub Pop"] }))).toBe(true)
      expect(p.check(makePlay({ labels: [] }))).toBe(false)
    })
  })

  describe("Additional Temporal Predicates", () => {

    it("releasedBetween", () => {
      const start = new Date("2000-01-01")
      const end = new Date("2010-01-01")
      const p = SemanticPredicate.releasedBetween(start, end)
      expect(p.description).toBe(`released between ${start.toISOString()} and ${end.toISOString()}`)
      expect(p.check(makePlay({ release_date: new Date("2005-01-01") }))).toBe(true)
      expect(p.check(makePlay({ release_date: new Date("1999-01-01") }))).toBe(false)
      expect(p.check(makePlay({ release_date: new Date("2011-01-01") }))).toBe(false)
      expect(p.check(makePlay({ release_date: null }))).toBe(false)
    })
  })

  describe("Existence Predicates", () => {
    it("hasAlbum", () => {
      const p = SemanticPredicate.hasAlbum
      expect(p.description).toBe("has an album")
      expect(p.check(makePlay({ album: "Album" }))).toBe(true)
      expect(p.check(makePlay({ album: null }))).toBe(false)
    })

    it("hasReleaseDate", () => {
      const p = SemanticPredicate.hasReleaseDate
      expect(p.description).toBe("has a release date")
      expect(p.check(makePlay({ release_date: new Date() }))).toBe(true)
      expect(p.check(makePlay({ release_date: null }))).toBe(false)
    })

    it("hasImage", () => {
      const p = SemanticPredicate.hasImage
      expect(p.description).toBe("has an image")
      expect(p.check(makePlay({ image_uri: "http://example.com/image.jpg" }))).toBe(true)
      expect(p.check(makePlay({ image_uri: null }))).toBe(false)
    })

    it("hasThumbnail", () => {
      const p = SemanticPredicate.hasThumbnail
      expect(p.description).toBe("has a thumbnail")
      expect(p.check(makePlay({ thumbnail_uri: "http://example.com/thumb.jpg" }))).toBe(true)
      expect(p.check(makePlay({ thumbnail_uri: null }))).toBe(false)
    })

    it("hasRotationStatus", () => {
      const p = SemanticPredicate.hasRotationStatus
      expect(p.description).toBe("has a rotation status")
      expect(p.check(makePlay({ rotation_status: "Heavy" }))).toBe(true)
      expect(p.check(makePlay({ rotation_status: null }))).toBe(false)
    })
  })

  describe("Rotation Predicates", () => {
    it("isHeavyRotation", () => {
      const p = SemanticPredicate.isHeavyRotation
      expect(p.description).toBe("is in heavy rotation")
      expect(p.check(makePlay({ rotation_status: "Heavy" }))).toBe(true)
      expect(p.check(makePlay({ rotation_status: "Medium" }))).toBe(false)
    })

    it("isMediumRotation", () => {
      const p = SemanticPredicate.isMediumRotation
      expect(p.description).toBe("is in medium rotation")
      expect(p.check(makePlay({ rotation_status: "Medium" }))).toBe(true)
      expect(p.check(makePlay({ rotation_status: "Heavy" }))).toBe(false)
    })

    it("isLightRotation", () => {
      const p = SemanticPredicate.isLightRotation
      expect(p.description).toBe("is in light rotation")
      expect(p.check(makePlay({ rotation_status: "Light" }))).toBe(true)
      expect(p.check(makePlay({ rotation_status: "Heavy" }))).toBe(false)
    })

    it("isLibraryRotation", () => {
      const p = SemanticPredicate.isLibraryRotation
      expect(p.description).toBe("is in library rotation")
      expect(p.check(makePlay({ rotation_status: "Library" }))).toBe(true)
      expect(p.check(makePlay({ rotation_status: "Heavy" }))).toBe(false)
    })


    it("isRNRotation", () => {
      const p = SemanticPredicate.isRNRotation
      expect(p.description).toBe("is in R/N rotation")
      expect(p.check(makePlay({ rotation_status: "R/N" }))).toBe(true)
      expect(p.check(makePlay({ rotation_status: "Heavy" }))).toBe(false)
    })
  })

  // === Mock Data Helpers ===

  const makeProgram = (overrides: any = {}): any => ({
    id: 1,
    uri: "uri",
    name: "Morning Show",
    description: "Morning music",
    tags: "morning,eclectic",
    image_uri: "img",
    thumbnail_uri: "thumb",
    is_active: true,
    location: 1,
    location_name: "Seattle",
    ...overrides
  })

  const makeShow = (overrides: any = {}): any => ({
    id: 1,
    uri: "uri",
    program: 1,
    program_uri: "uri",
    hosts: [1],
    host_uris: ["uri"],
    program_name: "Morning Show",
    program_tags: "morning",
    host_names: ["John"],
    tagline: "Wake up!",
    image_uri: "img",
    program_image_uri: "img",
    start_time: "2023-01-01T08:00:00Z",
    location: 1,
    location_name: "Seattle",
    ...overrides
  })

  const makeHost = (overrides: any = {}): any => ({
    id: 1,
    uri: "uri",
    name: "John Doe",
    image_uri: "img",
    thumbnail_uri: "thumb",
    is_active: true,
    location: 1,
    ...overrides
  })

  const makeTimeslot = (overrides: any = {}): any => ({
    id: 1,
    uri: "uri",
    program: 1,
    program_uri: "uri",
    program_name: "Morning Show",
    program_tags: "morning",
    hosts: [1],
    host_uris: ["uri"],
    host_names: ["John"],
    weekday: 1,
    start_date: "2023-01-01",
    end_date: null,
    start_time: "08:00:00",
    end_time: "12:00:00",
    duration: "04:00:00",
    ...overrides
  })

  describe("Program Predicates", () => {
    it("programHasName", () => {
      const p = SemanticPredicate.programHasName("Morning")
      expect(p.description).toBe('program name contains "Morning"')
      expect(p.check(makeProgram())).toBe(true)
      expect(p.check(makeProgram({ name: "Evening" }))).toBe(false)
    })

    it("programIsActive", () => {
      const p = SemanticPredicate.programIsActive
      expect(p.description).toBe("program is active")
      expect(p.check(makeProgram())).toBe(true)
      expect(p.check(makeProgram({ is_active: false }))).toBe(false)
    })

    it("programHasTag", () => {
      const p = SemanticPredicate.programHasTag("eclectic")
      expect(p.description).toBe('program has tag "eclectic"')
      expect(p.check(makeProgram())).toBe(true)
      expect(p.check(makeProgram({ tags: "rock" }))).toBe(false)
    })
  })

  describe("Show Predicates", () => {
    it("showHasProgramName", () => {
      const p = SemanticPredicate.showHasProgramName("Morning")
      expect(p.description).toBe('show program name contains "Morning"')
      expect(p.check(makeShow())).toBe(true)
      expect(p.check(makeShow({ program_name: "Evening" }))).toBe(false)
    })

    it("showHasHost", () => {
      const p = SemanticPredicate.showHasHost("John")
      expect(p.description).toBe('show has host "John"')
      expect(p.check(makeShow())).toBe(true)
      expect(p.check(makeShow({ host_names: ["Jane"] }))).toBe(false)
    })

    it("showHasTagline", () => {
      const p = SemanticPredicate.showHasTagline("Wake")
      expect(p.description).toBe('show tagline contains "Wake"')
      expect(p.check(makeShow())).toBe(true)
      expect(p.check(makeShow({ tagline: "Sleep" }))).toBe(false)
    })
  })

  describe("Host Predicates", () => {
    it("hostHasName", () => {
      const p = SemanticPredicate.hostHasName("John")
      expect(p.description).toBe('host name contains "John"')
      expect(p.check(makeHost())).toBe(true)
      expect(p.check(makeHost({ name: "Jane" }))).toBe(false)
    })

    it("hostIsActive", () => {
      const p = SemanticPredicate.hostIsActive
      expect(p.description).toBe("host is active")
      expect(p.check(makeHost())).toBe(true)
      expect(p.check(makeHost({ is_active: false }))).toBe(false)
    })
  })

  describe("Timeslot Predicates", () => {
    it("timeslotHasProgramName", () => {
      const p = SemanticPredicate.timeslotHasProgramName("Morning")
      expect(p.description).toBe('timeslot program name contains "Morning"')
      expect(p.check(makeTimeslot())).toBe(true)
      expect(p.check(makeTimeslot({ program_name: "Evening" }))).toBe(false)
    })

    it("timeslotHasHost", () => {
      const p = SemanticPredicate.timeslotHasHost("John")
      expect(p.description).toBe('timeslot has host "John"')
      expect(p.check(makeTimeslot())).toBe(true)
      expect(p.check(makeTimeslot({ host_names: ["Jane"] }))).toBe(false)
    })


    it("timeslotIsOnWeekday", () => {
      const p = SemanticPredicate.timeslotIsOnWeekday(1)
      expect(p.description).toBe("timeslot is on weekday 1")
      expect(p.check(makeTimeslot())).toBe(true)
      expect(p.check(makeTimeslot({ weekday: 2 }))).toBe(false)
    })

    it("timeslotHasDuration", () => {
      const duration = Duration.hours(4)
      const p = SemanticPredicate.timeslotHasDuration(duration)
      expect(p.description).toBe(`timeslot duration is ${Duration.format(duration)}`)
      expect(p.check(makeTimeslot({ duration: "04:00:00" }))).toBe(true)
      expect(p.check(makeTimeslot({ duration: "03:00:00" }))).toBe(false)
    })

    it("timeslotLongerThan", () => {
      const duration = Duration.hours(3)
      const p = SemanticPredicate.timeslotLongerThan(duration)
      expect(p.description).toBe(`timeslot longer than ${Duration.format(duration)}`)
      expect(p.check(makeTimeslot({ duration: "04:00:00" }))).toBe(true)
      expect(p.check(makeTimeslot({ duration: "02:00:00" }))).toBe(false)
    })

    it("timeslotShorterThan", () => {
      const duration = Duration.hours(5)
      const p = SemanticPredicate.timeslotShorterThan(duration)
      expect(p.description).toBe(`timeslot shorter than ${Duration.format(duration)}`)
      expect(p.check(makeTimeslot({ duration: "04:00:00" }))).toBe(true)
      expect(p.check(makeTimeslot({ duration: "06:00:00" }))).toBe(false)
    })
  })
})
