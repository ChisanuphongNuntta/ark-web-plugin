// Unit tests for Public/MovementLogic.h (pure logic, no ArkApi needed).
// Build: cl /nologo /std:c++17 /EHsc /W4 /WX /I..\Public test_movement_logic.cpp
#include "MovementLogic.h"

#include <xmmintrin.h>
#include <cstdio>
#include <cstddef>
#include <limits>

using namespace IrisMovement;

static int g_failures = 0;
static int g_checks = 0;

#define CHECK(cond)                                                                 \
    do {                                                                            \
        ++g_checks;                                                                 \
        if (!(cond)) {                                                              \
            ++g_failures;                                                           \
            std::printf("FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond);             \
        }                                                                           \
    } while (0)

// Mirror of the SDK's FTransform (API/UE/UE.h) and of the server PDB layout.
struct FakeTransform
{
    __m128 Rotation;
    __m128 Translation;
    __m128 Scale3D;
};
static_assert(sizeof(FakeTransform) == kTransformSize, "size");
static_assert(offsetof(FakeTransform, Translation) == kTransformTranslationOffset, "offset");

static FakeTransform MakeTransform(float x, float y, float z)
{
    FakeTransform t;
    t.Rotation = _mm_set_ps(1.0f, 0.0f, 0.0f, 0.0f);   // identity quat (w in lane 3)
    t.Translation = _mm_set_ps(0.0f, z, y, x);        // lanes: x, y, z, w
    t.Scale3D = _mm_set_ps(0.0f, 1.0f, 1.0f, 1.0f);
    return t;
}

static void TestWorldLocationExtraction()
{
    Vec3 v{};
    FakeTransform t = MakeTransform(-151234.5f, 260100.25f, -3120.0f);
    CHECK(ExtractTransformTranslation(&t, v));
    CHECK(v.X == -151234.5f && v.Y == 260100.25f && v.Z == -3120.0f);

    // Misaligned copy of the same bytes must still decode (no aligned SSE load).
    alignas(16) unsigned char buffer[sizeof(FakeTransform) + 16];
    unsigned char* misaligned = buffer + 4;
    std::memcpy(misaligned, &t, sizeof(t));
    Vec3 m{};
    CHECK(ExtractTransformTranslation(misaligned, m));
    CHECK(m.X == v.X && m.Y == v.Y && m.Z == v.Z);

    // Identity / uninitialised transform is rejected -> caller falls back.
    FakeTransform zero = MakeTransform(0.0f, 0.0f, 0.0f);
    CHECK(!ExtractTransformTranslation(&zero, m));

    // NaN / Inf / absurd values rejected.
    const float nan = std::numeric_limits<float>::quiet_NaN();
    const float inf = std::numeric_limits<float>::infinity();
    FakeTransform bad1 = MakeTransform(nan, 1.0f, 1.0f);
    FakeTransform bad2 = MakeTransform(1.0f, inf, 1.0f);
    FakeTransform bad3 = MakeTransform(1.0f, 1.0f, 5.0e8f);
    CHECK(!ExtractTransformTranslation(&bad1, m));
    CHECK(!ExtractTransformTranslation(&bad2, m));
    CHECK(!ExtractTransformTranslation(&bad3, m));
    CHECK(!ExtractTransformTranslation(nullptr, m));

    // A legit point on an axis (only one zero component) is accepted.
    FakeTransform axis = MakeTransform(0.0f, 0.0f, 120.0f);
    CHECK(ExtractTransformTranslation(&axis, m));

    CHECK(IsUsableWorldLocation(1.0f, 0.0f, 0.0f));
    CHECK(!IsUsableWorldLocation(0.0f, 0.0f, 0.0f));
}

static MovementObservation Obs(const void* pc, const void* pawn, int idx, bool attached, bool incap, double now)
{
    MovementObservation o;
    o.controller = pc;
    o.pawn = pawn;
    o.pawnIndex = idx;
    o.attached = attached;
    o.incapacitated = incap;
    o.now = now;
    return o;
}

static void TestTransitions()
{
    int pcA = 0, pcB = 0, pawn1 = 0, pawn2 = 0;
    MovementTrackState s;

    // (d) login / first sight
    CHECK(ObserveAndEvaluate(s, Obs(&pcA, &pawn1, 10, false, false, 1.00)) == ResetReason::FirstObservation);
    // steady walking
    CHECK(ObserveAndEvaluate(s, Obs(&pcA, &pawn1, 10, false, false, 1.03)) == ResetReason::None);
    CHECK(ObserveAndEvaluate(s, Obs(&pcA, &pawn1, 10, false, false, 1.06)) == ResetReason::None);

    // (b) mount
    CHECK(ObserveAndEvaluate(s, Obs(&pcA, &pawn1, 10, true, false, 1.10)) == ResetReason::MountStateChanged);
    // riding stays mounted -> no reset
    CHECK(ObserveAndEvaluate(s, Obs(&pcA, &pawn1, 10, true, false, 1.13)) == ResetReason::None);
    // (b) dismount
    CHECK(ObserveAndEvaluate(s, Obs(&pcA, &pawn1, 10, false, false, 1.16)) == ResetReason::MountStateChanged);
    CHECK(ObserveAndEvaluate(s, Obs(&pcA, &pawn1, 10, false, false, 1.19)) == ResetReason::None);

    // (c) unconscious: first unconscious tick itself is a normal observation...
    CHECK(ObserveAndEvaluate(s, Obs(&pcA, &pawn1, 10, false, true, 1.22)) == ResetReason::None);
    // ...but while still unconscious every following tick re-baselines
    CHECK(ObserveAndEvaluate(s, Obs(&pcA, &pawn1, 10, false, true, 1.25)) == ResetReason::RecoveredFromIncapacitated);
    // waking up resets once
    CHECK(ObserveAndEvaluate(s, Obs(&pcA, &pawn1, 10, false, false, 1.28)) == ResetReason::RecoveredFromIncapacitated);
    CHECK(ObserveAndEvaluate(s, Obs(&pcA, &pawn1, 10, false, false, 1.31)) == ResetReason::None);

    // (c) death -> respawn screen (no pawn) -> respawn at bed with new pawn
    MarkIncapacitated(s, &pcA, &pawn1, 1.34);
    MarkIncapacitated(s, &pcA, nullptr, 1.37);
    CHECK(ObserveAndEvaluate(s, Obs(&pcA, &pawn2, 11, false, false, 9.0)) == ResetReason::PawnChanged);
    CHECK(ObserveAndEvaluate(s, Obs(&pcA, &pawn2, 11, false, false, 9.03)) == ResetReason::None);

    // death and respawn reusing the SAME pawn address (allocator reuse): still resets
    MarkIncapacitated(s, &pcA, &pawn2, 9.06);
    CHECK(ObserveAndEvaluate(s, Obs(&pcA, &pawn2, 11, false, false, 9.09)) == ResetReason::RecoveredFromIncapacitated);

    // (a) pawn pointer reused with a different UObject index (new object at same address)
    CHECK(ObserveAndEvaluate(s, Obs(&pcA, &pawn2, 12, false, false, 9.12)) == ResetReason::PawnChanged);

    // (d) reconnect: new PlayerController for the same SteamID
    CHECK(ObserveAndEvaluate(s, Obs(&pcB, &pawn2, 12, false, false, 9.15)) == ResetReason::ControllerChanged);
    CHECK(ObserveAndEvaluate(s, Obs(&pcB, &pawn2, 12, false, false, 9.18)) == ResetReason::None);

    // Observation gap (e.g. player was skipped while admin / server hitch)
    CHECK(ObserveAndEvaluate(s, Obs(&pcB, &pawn2, 12, false, false, 20.0)) == ResetReason::ObservationGap);
    // World time going backwards (map/time reset)
    CHECK(ObserveAndEvaluate(s, Obs(&pcB, &pawn2, 12, false, false, 5.0)) == ResetReason::ObservationGap);
    CHECK(ObserveAndEvaluate(s, Obs(&pcB, &pawn2, 12, false, false, 5.03)) == ResetReason::None);

    // Explicit invalidate (admin skip / logout)
    Invalidate(s);
    CHECK(ObserveAndEvaluate(s, Obs(&pcB, &pawn2, 12, false, false, 5.06)) == ResetReason::FirstObservation);

    // Mount + pawn change in the same tick reports a reset (either reason is fine)
    CHECK(ObserveAndEvaluate(s, Obs(&pcB, &pawn1, 13, true, false, 5.09)) != ResetReason::None);
}

// Reproduces the field report with a minimal model of CheckPlayerMovement's delta check:
// rider at world (~-150000, 210000) on a dino; root RelativeLocation reads (0,0,0).
static void TestRiderNoLongerTeleports()
{
    const float maxTeleportDelta = 8000.0f;
    const float wx = -150912.0f, wy = 211230.0f, wz = -1200.0f;

    // Old behaviour: baseline taken while walking (world), then rider reads relative (0,0,0)
    const float oldDelta = std::sqrt(wx * wx + wy * wy + wz * wz);
    CHECK(oldDelta > maxTeleportDelta);   // -> "[Teleport] Instant teleport delta: 25xxxx > 8000"

    // New behaviour: world translation comes from ComponentToWorld while attached
    FakeTransform riderXf = MakeTransform(wx + 35.0f, wy - 12.0f, wz + 180.0f); // saddle socket offset
    Vec3 rider{};
    CHECK(ExtractTransformTranslation(&riderXf, rider));
    const float dx = rider.X - wx, dy = rider.Y - wy, dz = rider.Z - wz;
    const float newDelta = std::sqrt(dx * dx + dy * dy + dz * dz);
    CHECK(newDelta < maxTeleportDelta);

    // And the mount transition itself re-baselines, so even that small jump is never compared.
    int pc = 0, pawn = 0;
    MovementTrackState s;
    ObserveAndEvaluate(s, Obs(&pc, &pawn, 1, false, false, 0.0));
    CHECK(ObserveAndEvaluate(s, Obs(&pc, &pawn, 1, true, false, 0.03)) == ResetReason::MountStateChanged);
}

int main()
{
    TestWorldLocationExtraction();
    TestTransitions();
    TestRiderNoLongerTeleports();

    std::printf("%d checks, %d failures\n", g_checks, g_failures);
    return g_failures == 0 ? 0 : 1;
}
