// Deck creation wizard — step 4.
//
// "Confirm and create." The deck has been built (step 2) and reviewed
// (step 3); this step lets the user adjust last-mile metadata (name,
// description, visibility) and flip status to READY_TO_PLAY before
// landing on the public deck detail page.
//
// Anon owners can't promote off PRIVATE — the visibility selector is
// disabled in that case. PUT /decks/{id} only sends fields the user
// actually touched; unchanged fields stay null so the backend's
// partial-update semantics leave them alone.

import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { PageContent } from "@/components/page-content";
import { useAuth } from "@/lib/auth";
import {
  useDeckById,
  useUpdateDeck,
  type DeckDto,
  type UpdateDeckRequest,
} from "@/lib/queries/decks";

const PAGE_PADDING = 24;

type Visibility = "PUBLIC" | "PRIVATE" | "UNLISTED";

const VISIBILITY_OPTIONS: {
  key: Visibility;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    key: "PRIVATE",
    label: "Private",
    hint: "Only you can see this deck.",
    icon: "lock-closed",
  },
  {
    key: "UNLISTED",
    label: "Unlisted",
    hint: "Anyone with the link can view, but it won't appear in browse.",
    icon: "link",
  },
  {
    key: "PUBLIC",
    label: "Public",
    hint: "Listed publicly. Other players can favorite and copy it.",
    icon: "globe-outline",
  },
];

export default function DeckFinalizeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const isAnon = !user;

  const deckQuery = useDeckById(id);
  const deck = deckQuery.data;
  const updateDeck = useUpdateDeck(id);

  // Local form state. Synced from the loaded deck once; after that the
  // user owns it. Description defaults to empty so the textarea is happy
  // to render even when the backend sends back undefined.
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("PRIVATE");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!deck || hydrated) return;
    setName(deck.name ?? "");
    setDescription(deck.description ?? "");
    setVisibility((deck.visibility as Visibility) ?? "PRIVATE");
    setHydrated(true);
  }, [deck, hydrated]);

  const totalCount = useMemo(() => {
    if (!deck) return 0;
    let total = 0;
    for (const c of deck.cards ?? []) total += c.count ?? 1;
    for (const c of deck.commander ?? []) total += c.count ?? 1;
    return total;
  }, [deck]);

  const handleSubmit = async (asDraft: boolean) => {
    if (!deck) return;
    // Build the diff: only fields actually changed get sent. Saves a
    // round of backend logic for no-op updates and keeps the PUT body
    // honest about user intent.
    const req: UpdateDeckRequest = {};
    if (name.trim() && name.trim() !== deck.name) req.name = name.trim();
    if (description !== (deck.description ?? "")) {
      req.description = description;
    }
    if (!isAnon && visibility !== (deck.visibility ?? "PRIVATE")) {
      req.visibility = visibility;
    }
    // Status is the whole point of this step — always send it unless
    // they're choosing to keep editing.
    const targetStatus = asDraft ? "DRAFT" : "READY_TO_PLAY";
    if (targetStatus !== deck.status) {
      req.deck_status = targetStatus as "DRAFT" | "READY_TO_PLAY";
    }

    try {
      // Always run the mutation, even if `req` is empty — the cache
      // refetch on success makes sure the detail page lands fresh.
      if (Object.keys(req).length > 0) {
        await updateDeck.mutateAsync(req);
      }
      router.replace(`/decks/${id}` as any);
    } catch {
      // Error rendered inline below.
    }
  };

  const canSave = hydrated && !updateDeck.isPending && name.trim().length > 0;

  return (
    // KeyboardAvoidingView wraps the finalize step so the name +
    // description inputs stay visible above the on-screen keyboard.
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 96 }}
        keyboardShouldPersistTaps="handled"
      >
        <PageContent style={{ padding: PAGE_PADDING, maxWidth: 720 }}>
          <View
            className="mb-6 flex-row items-center"
            style={{ gap: 12 }}
          >
            <Pressable
              onPress={() => router.back()}
              className="rounded-md px-2 py-1 hover:bg-elevated active:bg-elevated"
            >
              <Text className="text-sm text-accent">← Back to review</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text className="text-xs uppercase tracking-wider text-muted">
                Finalize
              </Text>
              <Text className="font-brand text-xl text-foreground">
                Confirm and create
              </Text>
            </View>
          </View>

          {deckQuery.isLoading && !deck && (
            <View className="items-center py-12">
              <ActivityIndicator size="large" color="#D4B25E" />
            </View>
          )}

          {deckQuery.error && !deck && (
            <View className="rounded-lg bg-danger/20 p-4">
              <Text className="font-semibold text-danger">
                Couldn&apos;t load deck
              </Text>
              <Text className="mt-1 text-foreground">
                {(deckQuery.error as Error).message}
              </Text>
            </View>
          )}

          {deck && (
            <>
              <SummaryCard deck={deck} totalCount={totalCount} />

              <FieldGroup label="Deck name">
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Untitled deck"
                  placeholderTextColor="#9A9AA8"
                  className="rounded-lg border border-border bg-elevated px-4 py-3 text-foreground"
                  style={{
                    fontSize: 15,
                    color: "#E8E6E3",
                    ...(Platform.OS === "web"
                      ? ({ outlineStyle: "none" } as object)
                      : {}),
                  }}
                />
              </FieldGroup>

              <FieldGroup
                label="Description"
                hint="A short note about the strategy, vibe, or where it shines."
              >
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Optional"
                  placeholderTextColor="#9A9AA8"
                  multiline
                  numberOfLines={4}
                  className="rounded-lg border border-border bg-elevated px-4 py-3 text-foreground"
                  style={{
                    fontSize: 15,
                    color: "#E8E6E3",
                    minHeight: 96,
                    textAlignVertical: "top",
                    ...(Platform.OS === "web"
                      ? ({ outlineStyle: "none" } as object)
                      : {}),
                  }}
                />
              </FieldGroup>

              <FieldGroup
                label="Visibility"
                hint={
                  isAnon
                    ? "Sign in to share your decks publicly. Anon decks stay private."
                    : undefined
                }
              >
                <View style={{ gap: 8 }}>
                  {VISIBILITY_OPTIONS.map((opt) => (
                    <VisibilityOption
                      key={opt.key}
                      option={opt}
                      selected={visibility === opt.key}
                      disabled={isAnon && opt.key !== "PRIVATE"}
                      onPress={() => {
                        if (isAnon && opt.key !== "PRIVATE") return;
                        setVisibility(opt.key);
                      }}
                    />
                  ))}
                </View>
              </FieldGroup>

              {updateDeck.error && (
                <View className="mb-4 rounded-lg bg-danger/20 p-3">
                  <Text className="text-sm text-danger">
                    {(updateDeck.error as Error).message}
                  </Text>
                </View>
              )}

              <View
                className="mt-2 flex-row"
                style={{ gap: 12, flexWrap: "wrap" }}
              >
                <Pressable
                  onPress={() => handleSubmit(true)}
                  disabled={!canSave}
                  className="flex-1 rounded-lg border border-border bg-elevated px-4 py-3 hover:bg-border/40 active:bg-border/40"
                  style={{
                    minWidth: 160,
                    opacity: canSave ? 1 : 0.5,
                  }}
                >
                  <Text className="text-center text-sm font-semibold text-foreground">
                    Save as draft
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => handleSubmit(false)}
                  disabled={!canSave}
                  className="flex-1 flex-row items-center justify-center rounded-lg bg-accent px-4 py-3 hover:bg-accent/90 active:bg-accent/80"
                  style={{
                    minWidth: 200,
                    gap: 8,
                    opacity: canSave ? 1 : 0.5,
                  }}
                >
                  {updateDeck.isPending ? (
                    <ActivityIndicator size="small" color="#0F0F12" />
                  ) : (
                    <Ionicons name="checkmark" size={18} color="#0F0F12" />
                  )}
                  <Text className="font-semibold text-background">
                    Create deck
                  </Text>
                </Pressable>
              </View>

              <Text className="mt-4 text-xs text-muted">
                You can edit any of this later from the deck&apos;s detail
                page.
              </Text>
            </>
          )}
        </PageContent>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SummaryCard({
  deck,
  totalCount,
}: {
  deck: DeckDto;
  totalCount: number;
}) {
  return (
    <View
      className="mb-6 rounded-xl border border-border"
      style={{ backgroundColor: "#15151A", padding: 16, gap: 12 }}
    >
      <Text className="text-xs uppercase tracking-wider text-muted">
        Summary
      </Text>
      <View
        className="flex-row flex-wrap"
        style={{ gap: 20, rowGap: 12 }}
      >
        <SummaryItem label="Format" value={deck.format ?? "—"} />
        <SummaryItem
          label="Cards"
          value={`${totalCount}${totalCount === 1 ? " card" : " cards"}`}
        />
        {deck.commander && deck.commander.length > 0 && (
          <SummaryItem
            label="Commander"
            value={deck.commander.map((c) => c.name).join(" · ")}
          />
        )}
        {deck.colors && deck.colors.length > 0 && (
          <SummaryItem label="Colors" value={deck.colors.join(" / ")} />
        )}
      </View>
    </View>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-[10px] uppercase tracking-wider text-muted">
        {label}
      </Text>
      <Text className="mt-0.5 font-brand text-base text-foreground">
        {value}
      </Text>
    </View>
  );
}

function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-5">
      <Text className="mb-2 text-xs uppercase tracking-wider text-muted">
        {label}
      </Text>
      {children}
      {hint && <Text className="mt-1.5 text-xs text-muted">{hint}</Text>}
    </View>
  );
}

function VisibilityOption({
  option,
  selected,
  disabled,
  onPress,
}: {
  option: (typeof VISIBILITY_OPTIONS)[number];
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`flex-row items-start rounded-lg border p-3 ${
        selected
          ? "border-accent bg-accent/10"
          : "border-border bg-elevated hover:bg-border/30 active:bg-border/30"
      }`}
      style={{
        gap: 12,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          borderWidth: 2,
          borderColor: selected ? "#D4B25E" : "#9A9AA8",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 2,
        }}
      >
        {selected && (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: "#D4B25E",
            }}
          />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Ionicons
            name={option.icon}
            size={15}
            color={selected ? "#D4B25E" : "#9A9AA8"}
          />
          <Text
            className={`text-sm font-semibold ${
              selected ? "text-accent" : "text-foreground"
            }`}
          >
            {option.label}
          </Text>
        </View>
        <Text className="mt-1 text-xs text-muted">{option.hint}</Text>
      </View>
    </Pressable>
  );
}
