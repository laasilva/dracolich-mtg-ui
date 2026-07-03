// Responsive navigation wrapper. Picks layout based on viewport width:
// - >= 768px (web/tablet): top horizontal bar
// - < 768px (mobile): hamburger header that opens a drawer
//
// The route content slot is the children prop. Routes themselves are owned
// by Expo Router; this is just the chrome around them.

import { BrandMark } from "@/components/ui/brand-mark";
import { SearchBar } from "@/components/search-bar";
import { SearchSuggestions } from "@/components/search-suggestions";
import { useAuth } from "@/lib/auth";
import { confirmDialog } from "@/lib/dialogs";
import { useSearchControls } from "@/lib/search";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Link, usePathname, useRouter } from "expo-router";
import { ComponentProps, ReactNode, useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions
} from "react-native";
import Animated, { FadeIn, FadeOut, SlideInLeft, SlideOutLeft } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

interface NavItem {
  label: string;
  href: string;
  icon: IoniconName;
}

// Icons mirror v0's lucide picks: Layers for Decks, Library for Cards,
// Albums for Sets. Available in @expo/vector-icons so no new dependency.
const ITEMS: NavItem[] = [
  { label: "Cards", href: "/cards", icon: "library-outline" },
  { label: "Decks", href: "/decks", icon: "layers-outline" },
  { label: "Sets", href: "/sets", icon: "albums-outline" },
];

const WIDE_BREAKPOINT = 768;

// Web only: cap the inner content width so the app doesn't stretch edge to
// edge on wide monitors. The outer chrome (header background, page bg)
// still spans the full viewport — only the inner column is constrained.
// 1280px is a comfortable reading/dashboard width; everything wider gets
// equal gutters on either side.
const WEB_MAX_CONTENT_WIDTH = 1280;
const isWeb = Platform.OS === "web";

export function NavShell({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  const pathname = usePathname();

  // State for both popovers lives here so the backdrops (rendered in the
  // content area, NOT over the header) can be siblings of children.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  // Close any open menu when navigation happens.
  useEffect(() => {
    setDrawerOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  const toggleAccount = () => setAccountOpen((o) => !o);
  const closeAccount = () => setAccountOpen(false);

  return (
    <View className="flex-1 bg-background">
      {isWide ? (
        <TopBar
          accountOpen={accountOpen}
          onToggleAccount={toggleAccount}
          onCloseAccount={closeAccount}
        />
      ) : (
        <MobileHeader
          drawerOpen={drawerOpen}
          onToggleDrawer={() => setDrawerOpen((o) => !o)}
          accountOpen={accountOpen}
          onToggleAccount={toggleAccount}
          onCloseAccount={closeAccount}
        />
      )}
      {/* Content area — both the drawer overlay and the account-menu backdrop
          are positioned absolutely inside this wrapper. The header (z-index 100)
          sits above, so its toggle buttons are always reachable.
          Inline `position: relative` is required because NativeWind's `relative`
          class is unreliable as a positioning anchor on iOS native.

          The content area stays full-bleed so pages can render overlays
          (panels, sheets) at the viewport edge. Each page is responsible
          for capping its OWN main content via PageContent — that keeps
          chrome and overlays aligned to the viewport while main content
          sits in a centered max-width column. */}
      <View style={{ flex: 1, position: "relative" }}>
        <View style={{ flex: 1 }}>{children}</View>
        {/* Search suggestions overlay — sibling of children so it floats
            above page content. Renders nothing when the search input is
            empty; mobile gets a dim/blur backdrop, web is a small panel. */}
        <SearchSuggestions />
        {!isWide && drawerOpen && (
          <MobileDrawer onClose={() => setDrawerOpen(false)} />
        )}
        {accountOpen && (
          <Pressable
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              zIndex: 40
            }}
            onPress={closeAccount}
          />
        )}
      </View>
    </View>
  );
}

// ---------- Account menu — shared shape ----------

type AccountMenuItem =
  | { label: string; href: string; variant?: "danger" }
  | { label: string; action: () => void; variant?: "danger" };

function useAccountMenuItems(): AccountMenuItem[] {
  const { user, logout } = useAuth();

  // Confirmation gate before destroying the session. confirmDialog handles
  // the platform split — native Alert on iOS/Android, window.confirm on web
  // (RN-Web's Alert polyfill silently drops the button array).
  const confirmLogout = async () => {
    const ok = await confirmDialog({
      title: "Sign out?",
      message: "You'll need to sign in again to access your account.",
      confirmText: "Sign out",
      cancelText: "Cancel",
      destructive: true,
    });
    if (ok) await logout();
  };

  if (user) {
    return [
      { label: "Profile", href: "/account" },
      { label: "My decks", href: "/account/decks" },
      { label: "Favorite decks", href: "/account/favorites" },
      { label: "Settings", href: "/account/settings" },
      { label: "Sign out", action: confirmLogout, variant: "danger" },
    ];
  }
  return [
    { label: "Log in", href: "/login" },
    { label: "Sign up", href: "/signup" },
  ];
}

function AccountMenuRow({
  item,
  onClose,
}: {
  item: AccountMenuItem;
  onClose: () => void;
}) {
  const router = useRouter();
  const isDanger = item.variant === "danger";
  const colorClass = isDanger ? "text-danger" : "text-foreground";
  // hover: web mouse hover. active: native press / web mousedown.
  // Danger items use a red-tinted hover so the destructive action stays distinct.
  const interactiveClass = isDanger
    ? "hover:bg-danger/20 active:bg-danger/20"
    : "hover:bg-border active:bg-border";

  return (
    <Pressable
      className={`px-4 py-3 ${interactiveClass}`}
      onPress={() => {
        if ("href" in item) {
          router.push(item.href as any);
        } else {
          item.action();
        }
        onClose();
      }}
    >
      <Text className={colorClass}>{item.label}</Text>
    </Pressable>
  );
}

// ---------- Web / tablet: top horizontal bar ----------

function TopBar({
  accountOpen,
  onToggleAccount,
  onCloseAccount,
}: {
  accountOpen: boolean;
  onToggleAccount: () => void;
  onCloseAccount: () => void;
}) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { inputValue, setInputValue } = useSearchControls();

  return (
    // Outer bar — translucent glass-strong background + bottom border so the
    // chrome reads like a layered surface over the body's radial gradient.
    // backdropFilter is web-only (the `webBlur` chunk); native falls back to
    // the alpha-blended surface fill.
    <View
      style={{
        zIndex: 100,
        position: "relative",
        backgroundColor: "rgba(20, 17, 30, 0.82)",
        borderBottomWidth: 1,
        borderBottomColor: "rgba(45, 37, 64, 0.85)",
        ...(isWeb
          ? ({
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
            } as object)
          : {}),
      }}
    >
      {/* Inner row — capped to the same max width as page content so the
          brand/links/search/account align with the columns below. */}
      <View
        className="flex-row items-center"
        style={{
          width: "100%",
          paddingHorizontal: 24,
          paddingTop: insets.top + 12,
          paddingBottom: 12,
          ...(isWeb
            ? ({
                maxWidth: WEB_MAX_CONTENT_WIDTH,
                alignSelf: "center",
              } as object)
            : {}),
        }}
      >
        <Link href="/" asChild>
          <Pressable>
            <BrandMark size={36} showWordmark={true} />
          </Pressable>
        </Link>

        <View className="ml-10 flex-1 flex-row gap-1">
          {ITEMS.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={pathname.startsWith(item.href)}
            />
          ))}
        </View>

        {/* Search bar — always-expanded on web (room to render the full
            input next to the brand + links + account avatar). Mobile keeps
            the icon-only / tap-to-expand behavior because there isn't
            room to render everything inline. */}
        <View className="mr-4">
          <SearchBar
            value={inputValue}
            onChangeText={setInputValue}
            maxWidth={320}
            placeholder="Search cards..."
            alwaysExpanded
          />
        </View>

        <TopBarAccountMenu
          open={accountOpen}
          onToggle={onToggleAccount}
          onClose={onCloseAccount}
        />
      </View>
    </View>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  // Active items use a subtle primary tint + accent text + icon. Inactive
  // items get a hover/press surface so the nav feels reactive.
  const stateClass = active
    ? "bg-primary/15"
    : "hover:bg-elevated/60 active:bg-elevated/80";
  const labelColor = active ? "text-accent" : "text-foreground";
  const iconColor = active ? "#D4B25E" : "#A39F93";

  return (
    <Link href={item.href as any} asChild>
      <Pressable
        className={`flex-row items-center rounded-md px-3 py-2 ${stateClass}`}
        style={{ gap: 8 }}
      >
        <Ionicons name={item.icon} size={16} color={iconColor} />
        <Text className={labelColor}>{item.label}</Text>
      </Pressable>
    </Link>
  );
}

function TopBarAccountMenu({
  open,
  onToggle,
  onClose,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const items = useAccountMenuItems();

  return (
    <View style={{ position: "relative" }}>
      <Pressable
        className="flex-row items-center rounded-full p-1 hover:bg-elevated/60 active:bg-elevated/80"
        onPress={onToggle}
        accessibilityLabel={user ? `Account: ${user.username}` : "Account menu"}
        style={{ gap: 6 }}
      >
        {user ? (
          // Gradient avatar with the user's initial. Matches v0's design.
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <LinearGradient
              colors={["#9B6BF2", "#D4B25E"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ position: "absolute", inset: 0 }}
            />
            <Text className="font-bold text-white" style={{ fontSize: 14 }}>
              {user.username.charAt(0).toUpperCase()}
            </Text>
          </View>
        ) : (
          <Ionicons
            name="person-circle-outline"
            size={32}
            color="#ECE9DF"
          />
        )}
        {/* Chevron indicates the avatar opens a menu — v0's affordance. */}
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={14}
          color="#A39F93"
        />
      </Pressable>

      {open && (
        <View
          className="absolute right-0 top-12 min-w-[200px] overflow-hidden rounded-xl border border-border py-1"
          style={{
            zIndex: 50,
            backgroundColor: "rgba(29, 24, 43, 0.92)",
            ...(isWeb
              ? ({
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                } as object)
              : {}),
          }}
        >
          {user && (
            <View className="border-b border-border px-4 py-3">
              <Text className="text-xs uppercase tracking-wider text-muted">
                Signed in as
              </Text>
              <Text className="mt-0.5 font-semibold text-foreground">
                {user.username}
              </Text>
            </View>
          )}
          {items.map((item, idx) => (
            <AccountMenuRow key={idx} item={item} onClose={onClose} />
          ))}
        </View>
      )}
    </View>
  );
}

// ---------- Mobile: hamburger + drawer ----------

function MobileHeader({
  drawerOpen,
  onToggleDrawer,
  accountOpen,
  onToggleAccount,
  onCloseAccount,
}: {
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  accountOpen: boolean;
  onToggleAccount: () => void;
  onCloseAccount: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { inputValue, setInputValue } = useSearchControls();
  const [searchExpanded, setSearchExpanded] = useState(false);

  // Reserve room for hamburger + paddings + search + account icons; the search
  // bar may grow to fill what's left.
  const searchMaxWidth = Math.max(160, screenWidth - 140);

  return (
    <View
      className="flex-row items-center px-4 py-3"
      // Same stacking-context trick as the web TopBar — see comment there.
      // Glass-strong background for the mystical layered feel.
      style={{
        paddingTop: insets.top + 6,
        zIndex: 100,
        position: "relative",
        backgroundColor: "rgba(20, 17, 30, 0.85)",
        borderBottomWidth: 1,
        borderBottomColor: "rgba(45, 37, 64, 0.85)",
        ...(isWeb
          ? ({
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
            } as object)
          : {}),
      }}
    >
      {/* Left: toggles the nav drawer. Icon swaps between hamburger and X. */}
      <Pressable
        onPress={onToggleDrawer}
        className="p-2"
        accessibilityLabel={drawerOpen ? "Close menu" : "Open menu"}
      >
        <Ionicons
          name={drawerOpen ? "close" : "menu"}
          size={28}
          color="#ECE9DF"
        />
      </Pressable>

      {/* Center: brand mark. Hidden while the search bar is expanded so the
          search bar has room to grow without truncating the wordmark. */}
      <View className="flex-1 items-center">
        {!searchExpanded && (
          <Link href="/" asChild>
            <Pressable>
              <BrandMark size={28} showWordmark={true} />
            </Pressable>
          </Link>
        )}
      </View>

      {/* Right: search (collapses to icon) + account menu */}
      <View className="mr-1">
        <SearchBar
          value={inputValue}
          onChangeText={setInputValue}
          onExpandedChange={setSearchExpanded}
          maxWidth={searchMaxWidth}
          placeholder="Search"
        />
      </View>

      <TopBarAccountMenu
        open={accountOpen}
        onToggle={onToggleAccount}
        onClose={onCloseAccount}
      />
    </View>
  );
}

function MobileDrawer({ onClose }: { onClose: () => void }) {
  return (
    <View className="absolute inset-0 z-50">
      {/* Backdrop — fades in/out. Tap-to-close. */}
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        className="absolute inset-0 bg-background/80"
      >
        <Pressable className="absolute inset-0" onPress={onClose} />
      </Animated.View>

      {/* Panel — slides in from the left. Glass-strong surface with the
          radial gradient from globals showing through on web. */}
      <Animated.View
        entering={SlideInLeft.duration(250)}
        exiting={SlideOutLeft.duration(200)}
        className="absolute bottom-0 left-0 top-0 w-80 max-w-[85%] border-r border-border"
        style={{
          backgroundColor: "rgba(20, 17, 30, 0.95)",
          ...(isWeb
            ? ({
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
              } as object)
            : {}),
        }}
      >
        <ScrollView className="px-6 pt-8">
          <View className="mb-6 flex-row items-center" style={{ gap: 12 }}>
            <BrandMark size={36} showWordmark={true} />
          </View>
          {ITEMS.map((item) => (
            <Link key={item.href} href={item.href as any} asChild>
              <Pressable
                className="flex-row items-center border-b border-border py-4"
                onPress={onClose}
                style={{ gap: 14 }}
              >
                <Ionicons name={item.icon} size={20} color="#D4B25E" />
                <Text className="text-xl text-foreground">{item.label}</Text>
              </Pressable>
            </Link>
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
}
