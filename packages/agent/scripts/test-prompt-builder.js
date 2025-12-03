"use strict";
/**
 * Test Prompt Builder Service
 *
 * Fetches recent KEXP plays and generates prompts for them.
 *
 * Usage: bun packages/agent/scripts/test-prompt-builder.ts
 */
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
Object.defineProperty(exports, "__esModule", { value: true });
var effect_1 = require("effect");
var domain_1 = require("@crate/domain");
var PromptBuilderService_js_1 = require("../src/services/PromptBuilderService.js");
var KexpPlaysResponse = domain_1.Kexp.KexpPlaysResponse, isTrackPlay = domain_1.Kexp.isTrackPlay;
// Fetch recent plays from KEXP API
var fetchRecentPlays = effect_1.Effect.gen(function () {
    var response, json, parsed;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [5 /*yield**/, __values(effect_1.Effect.tryPromise({
                    try: function () { return fetch("https://api.kexp.org/v2/plays/?format=json&limit=10"); },
                    catch: function (error) { return new Error("Failed to fetch plays: ".concat(error)); },
                }))];
            case 1:
                response = _a.sent();
                return [5 /*yield**/, __values(effect_1.Effect.tryPromise({
                        try: function () { return response.json(); },
                        catch: function (error) { return new Error("Failed to parse plays JSON: ".concat(error)); },
                    }))];
            case 2:
                json = _a.sent();
                return [5 /*yield**/, __values(effect_1.Schema.decodeUnknown(KexpPlaysResponse)(json).pipe(effect_1.Effect.mapError(function (error) { return new Error("Schema validation failed: ".concat(error)); })))];
            case 3:
                parsed = _a.sent();
                return [2 /*return*/, parsed.results.filter(isTrackPlay)];
        }
    });
});
// Fetch show info for a play
var fetchShowForPlay = function (showId) {
    return effect_1.Effect.gen(function () {
        var response, json;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [5 /*yield**/, __values(effect_1.Effect.tryPromise({
                        try: function () { return fetch("https://api.kexp.org/v2/shows/".concat(showId, "/?format=json")); },
                        catch: function (error) { return new Error("Failed to fetch show: ".concat(error)); },
                    }))];
                case 1:
                    response = _a.sent();
                    return [5 /*yield**/, __values(effect_1.Effect.tryPromise({
                            try: function () { return response.json(); },
                            catch: function (error) { return new Error("Failed to parse show JSON: ".concat(error)); },
                        }))];
                case 2:
                    json = _a.sent();
                    return [5 /*yield**/, __values(effect_1.Schema.decodeUnknown(domain_1.Kexp.KexpShow)(json).pipe(effect_1.Effect.mapError(function (error) { return new Error("Show schema validation failed: ".concat(error)); })))];
                case 3: return [2 /*return*/, _a.sent()];
            }
        });
    });
};
// Main test program
var program = effect_1.Effect.gen(function () {
    var promptBuilder, djBios, showDescriptions, plays, playsWithComments, testPlays, _i, testPlays_1, play, truncatedComment, show, _a, _b, hostName, djBio, builtPrompt, aiPrompt;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [5 /*yield**/, __values(effect_1.Console.log("🎵 Testing Prompt Builder Service\n"))
                // Get the prompt builder service (using Effect.Service accessor)
            ];
            case 1:
                _c.sent();
                return [5 /*yield**/, __values(PromptBuilderService_js_1.PromptBuilderService)
                    // Show loaded data stats
                ];
            case 2:
                promptBuilder = _c.sent();
                return [5 /*yield**/, __values(promptBuilder.getAllDjBios())];
            case 3:
                djBios = _c.sent();
                return [5 /*yield**/, __values(promptBuilder.getAllShowDescriptions())];
            case 4:
                showDescriptions = _c.sent();
                return [5 /*yield**/, __values(effect_1.Console.log("\uD83D\uDCDA Loaded ".concat(djBios.length, " DJ bios")))];
            case 5:
                _c.sent();
                return [5 /*yield**/, __values(effect_1.Console.log("\uD83D\uDCDA Loaded ".concat(showDescriptions.length, " show descriptions\n")))
                    // Fetch recent plays
                ];
            case 6:
                _c.sent();
                // Fetch recent plays
                return [5 /*yield**/, __values(effect_1.Console.log("Fetching recent KEXP plays..."))];
            case 7:
                // Fetch recent plays
                _c.sent();
                return [5 /*yield**/, __values(fetchRecentPlays)];
            case 8:
                plays = _c.sent();
                return [5 /*yield**/, __values(effect_1.Console.log("Found ".concat(plays.length, " track plays\n")))
                    // Process first 3 plays with DJ comments
                ];
            case 9:
                _c.sent();
                playsWithComments = plays.filter(function (p) { return p.comment && p.comment.length > 10; });
                testPlays = playsWithComments.length > 0 ? playsWithComments.slice(0, 3) : plays.slice(0, 3);
                _i = 0, testPlays_1 = testPlays;
                _c.label = 10;
            case 10:
                if (!(_i < testPlays_1.length)) return [3 /*break*/, 36];
                play = testPlays_1[_i];
                return [5 /*yield**/, __values(effect_1.Console.log("═".repeat(80)))];
            case 11:
                _c.sent();
                return [5 /*yield**/, __values(effect_1.Console.log("\n\uD83C\uDFB6 ".concat(play.artist, " - \"").concat(play.song, "\"")))];
            case 12:
                _c.sent();
                return [5 /*yield**/, __values(effect_1.Console.log("   Album: ".concat(play.album || "N/A")))];
            case 13:
                _c.sent();
                return [5 /*yield**/, __values(effect_1.Console.log("   Airdate: ".concat(play.airdate)))];
            case 14:
                _c.sent();
                if (!play.comment) return [3 /*break*/, 16];
                truncatedComment = play.comment.length > 200
                    ? play.comment.slice(0, 200) + "..."
                    : play.comment;
                return [5 /*yield**/, __values(effect_1.Console.log("   \uD83D\uDCAC DJ Comment: \"".concat(truncatedComment, "\"")))];
            case 15:
                _c.sent();
                _c.label = 16;
            case 16: return [5 /*yield**/, __values(fetchShowForPlay(play.show).pipe(effect_1.Effect.catchAll(function () { return effect_1.Effect.succeed(undefined); })))];
            case 17:
                show = _c.sent();
                if (!show) return [3 /*break*/, 24];
                return [5 /*yield**/, __values(effect_1.Console.log("   \uD83D\uDCFB Show: ".concat(show.program_name)))];
            case 18:
                _c.sent();
                return [5 /*yield**/, __values(effect_1.Console.log("   \uD83C\uDF99\uFE0F Host(s): ".concat(show.host_names.join(", "))))
                    // Check if we have DJ bio for the host(s)
                ];
            case 19:
                _c.sent();
                _a = 0, _b = show.host_names;
                _c.label = 20;
            case 20:
                if (!(_a < _b.length)) return [3 /*break*/, 24];
                hostName = _b[_a];
                return [5 /*yield**/, __values(promptBuilder.getDjBio(hostName))];
            case 21:
                djBio = _c.sent();
                if (!djBio) return [3 /*break*/, 23];
                return [5 /*yield**/, __values(effect_1.Console.log("   \u2705 Found DJ bio for ".concat(hostName)))];
            case 22:
                _c.sent();
                _c.label = 23;
            case 23:
                _a++;
                return [3 /*break*/, 20];
            case 24: return [5 /*yield**/, __values(promptBuilder.buildForKexpPlay(play, { show: show }))];
            case 25:
                builtPrompt = _c.sent();
                return [5 /*yield**/, __values(effect_1.Console.log("\n\uD83D\uDCDD Built Prompt:"))];
            case 26:
                _c.sent();
                return [5 /*yield**/, __values(effect_1.Console.log("   System prompt length: ".concat(builtPrompt.systemPrompt.length, " chars")))];
            case 27:
                _c.sent();
                return [5 /*yield**/, __values(effect_1.Console.log("   User message length: ".concat(builtPrompt.userMessage.length, " chars")))];
            case 28:
                _c.sent();
                return [5 /*yield**/, __values(effect_1.Console.log("   Has DJ bio: ".concat(builtPrompt.metadata.hasDjBio)))];
            case 29:
                _c.sent();
                return [5 /*yield**/, __values(effect_1.Console.log("   Has comment: ".concat(builtPrompt.metadata.hasComment)))
                    // Show a snippet of the user message
                ];
            case 30:
                _c.sent();
                // Show a snippet of the user message
                return [5 /*yield**/, __values(effect_1.Console.log("\n\uD83D\uDCC4 User Message Preview:"))];
            case 31:
                // Show a snippet of the user message
                _c.sent();
                return [5 /*yield**/, __values(effect_1.Console.log(builtPrompt.userMessage.slice(0, 500) + "..."))];
            case 32:
                _c.sent();
                return [5 /*yield**/, __values(effect_1.Console.log(""))
                    // Also test the @effect/ai Prompt integration
                ];
            case 33:
                _c.sent();
                aiPrompt = builtPrompt.toPrompt();
                return [5 /*yield**/, __values(effect_1.Console.log("\uD83E\uDD16 @effect/ai Prompt: ".concat(aiPrompt.content.length, " messages")))];
            case 34:
                _c.sent();
                _c.label = 35;
            case 35:
                _i++;
                return [3 /*break*/, 10];
            case 36: return [5 /*yield**/, __values(effect_1.Console.log("═".repeat(80)))];
            case 37:
                _c.sent();
                return [5 /*yield**/, __values(effect_1.Console.log("\n✅ Done!"))];
            case 38:
                _c.sent();
                return [2 /*return*/];
        }
    });
});
// Run with proper layers - PromptBuilderService.Default includes all dependencies
var runnable = program.pipe(effect_1.Effect.provide(PromptBuilderService_js_1.PromptBuilderService.Default));
effect_1.Effect.runPromise(runnable).catch(console.error);
