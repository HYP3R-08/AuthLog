#include "ui.h"

// Landscape layout (320 x 240): icon on the left, text column on the right.
// Same screens, colours and sounds as the portrait gateway in
// firmware/k10-gateway-v2/; only the geometry and the line breaks differ.

namespace {

// Same palette as the mobile app: one accent for the brand, green and red kept
// for the two verdicts so the colour alone says what happened.
constexpr uint32_t COLOR_BACKGROUND = 0x080B11;
constexpr uint32_t COLOR_SURFACE    = 0x161D29;
constexpr uint32_t COLOR_TEXT       = 0xEEF2F8;
constexpr uint32_t COLOR_MUTED      = 0x93A0B4;
constexpr uint32_t COLOR_BRAND      = 0x7B8CFF;
constexpr uint32_t COLOR_GRANTED    = 0x3DDC97;
constexpr uint32_t COLOR_DENIED     = 0xFF5D6C;
constexpr uint32_t COLOR_WARNING    = 0xFFB547;

// 1 and 3 are the two landscape rotations. 3 matches how the board is mounted
// on the prototype; if the text comes out upside down, switch to 1.
constexpr uint8_t  SCREEN_DIRECTION = 3;
constexpr int16_t  SCREEN_WIDTH     = 320;

constexpr int16_t  MARGIN_X         = 18;
constexpr int16_t  HEADER_Y         = 12;
constexpr int16_t  STATUS_DOT_X     = SCREEN_WIDTH - 24;
constexpr int16_t  STATUS_DOT_Y     = 24;

constexpr int16_t  ICON_X           = 76;
constexpr int16_t  ICON_Y           = 136;
constexpr int16_t  ICON_RADIUS      = 46;

constexpr int16_t  TEXT_X           = 148;  // right column: 172 px wide
constexpr int16_t  TITLE_Y          = 74;
constexpr int16_t  TITLE_LINE_H     = 28;
constexpr int16_t  BODY_LINE_H      = 22;
// About what fits in the column with the 16 px font; longer names are cut.
constexpr size_t   MAX_DETAIL_CHARS = 20;

constexpr int      NO_WRAP          = 50;  // library: values below 50 force line breaks
constexpr uint8_t  LED_BRIGHTNESS   = 6;

using Font = Canvas::eFontSize_t;

struct ScreenSpec {
  uint32_t accent;
  const char* title1;
  const char* title2;
  const char* body1;
  const char* body2;
};

UNIHIKER_K10* k10 = nullptr;
Music music;
bool hasShown = false;
Screen shownScreen = Screen::Booting;
String shownName;

// Lines kept to about 20 characters so they fit the narrower column.
ScreenSpec specFor(Screen screen) {
  switch (screen) {
    case Screen::Booting:   return {COLOR_BRAND,   "Avvio",     "",           "Connessione al",      "Wi-Fi in corso..."};
    case Screen::Offline:   return {COLOR_WARNING, "Wi-Fi",     "assente",    "Controlla la rete:",  "lettore in pausa"};
    case Screen::Idle:      return {COLOR_BRAND,   "Pronto",    "",           "Avvicinati al",       "lettore per entrare"};
    case Screen::Near:      return {COLOR_BRAND,   "Ciao!",     "",           "Avvicina il telefono", "al lettore NFC"};
    case Screen::Verifying: return {COLOR_WARNING, "Verifica",  "in corso",   "Attendi un istante",  ""};
    case Screen::Granted:   return {COLOR_GRANTED, "Accesso",   "consentito", "Puoi entrare",        ""};
    case Screen::Denied:    return {COLOR_DENIED,  "Accesso",   "negato",     "Pass non",            "autorizzato"};
    case Screen::Error:     return {COLOR_WARNING, "Errore",    "",           "Server non",          "raggiungibile"};
    case Screen::Setup:     return {COLOR_BRAND,   "Configura", "dall'app",   "Apri l'app e cerca:", ""};
    case Screen::Pairing:   return {COLOR_BRAND,   "Codice",    "",           "Inseriscilo sul",     "telefono"};
    case Screen::WifiSaved: return {COLOR_GRANTED, "Wi-Fi",     "aggiornato", "Connessione a:",      ""};
  }
  return {COLOR_BRAND, "", "", "", ""};
}

void text(const char* value, int16_t x, int16_t y, uint32_t color, Font font) {
  if (value && value[0] != '\0') {
    k10->canvas->canvasText(value, x, y, color, font, NO_WRAP, false);
  }
}

// Network and person names come from outside and can be long: cut them to the
// column, on a character boundary so a multi-byte letter is never split.
String fitColumn(const String& value) {
  if (value.length() <= MAX_DETAIL_CHARS) {
    return value;
  }
  size_t cut = MAX_DETAIL_CHARS - 3;
  while (cut > 0 && (static_cast<uint8_t>(value[cut]) & 0xC0) == 0x80) {
    cut--;
  }
  return value.substring(0, cut) + "...";
}

void drawHeader(uint32_t statusColor) {
  text("AuthLog", MARGIN_X, HEADER_Y, COLOR_TEXT, Canvas::eCNAndENFont24);
  k10->canvas->canvasCircle(STATUS_DOT_X, STATUS_DOT_Y, 6, statusColor, statusColor, true);
}

void drawCheck(uint32_t color) {
  k10->canvas->canvasSetLineWidth(9);
  k10->canvas->canvasLine(ICON_X - 22, ICON_Y + 2, ICON_X - 7, ICON_Y + 17, color);
  k10->canvas->canvasLine(ICON_X - 7, ICON_Y + 17, ICON_X + 24, ICON_Y - 15, color);
}

void drawCross(uint32_t color) {
  k10->canvas->canvasSetLineWidth(9);
  k10->canvas->canvasLine(ICON_X - 19, ICON_Y - 19, ICON_X + 19, ICON_Y + 19, color);
  k10->canvas->canvasLine(ICON_X + 19, ICON_Y - 19, ICON_X - 19, ICON_Y + 19, color);
}

void drawExclamation(uint32_t color) {
  k10->canvas->canvasSetLineWidth(9);
  k10->canvas->canvasLine(ICON_X, ICON_Y - 26, ICON_X, ICON_Y + 5, color);
  k10->canvas->canvasCircle(ICON_X, ICON_Y + 22, 5, color, color, true);
}

// Concentric rings: the NFC "waves" while the reader is waiting.
void drawRings(uint32_t color, bool filledCore) {
  k10->canvas->canvasSetLineWidth(3);
  k10->canvas->canvasCircle(ICON_X, ICON_Y, ICON_RADIUS + 8, COLOR_SURFACE, COLOR_SURFACE, false);
  k10->canvas->canvasCircle(ICON_X, ICON_Y, ICON_RADIUS - 12, color, color, false);
  k10->canvas->canvasCircle(ICON_X, ICON_Y, ICON_RADIUS - 30, color, color, filledCore);
}

void drawIcon(Screen screen, uint32_t accent) {
  switch (screen) {
    case Screen::Granted:
    case Screen::WifiSaved:
      k10->canvas->canvasCircle(ICON_X, ICON_Y, ICON_RADIUS, accent, accent, true);
      drawCheck(COLOR_BACKGROUND);
      break;
    case Screen::Denied:
      k10->canvas->canvasCircle(ICON_X, ICON_Y, ICON_RADIUS, accent, accent, true);
      drawCross(COLOR_BACKGROUND);
      break;
    case Screen::Error:
    case Screen::Offline:
      k10->canvas->canvasCircle(ICON_X, ICON_Y, ICON_RADIUS, accent, accent, true);
      drawExclamation(COLOR_BACKGROUND);
      break;
    case Screen::Near:
    case Screen::Pairing:
      drawRings(accent, true);
      break;
    default:
      drawRings(accent, false);
      break;
  }
}

void playFeedback(Screen screen) {
  switch (screen) {
    case Screen::Granted: music.playMusic(POWER_UP, OnceInBackground); break;
    case Screen::Denied:  music.playMusic(POWER_DOWN, OnceInBackground); break;
    case Screen::Error:   music.playMusic(WAWAWAWAA, OnceInBackground); break;
    default: break;
  }
}

void setLed(Screen screen, uint32_t accent) {
  const bool isResult = screen == Screen::Granted || screen == Screen::Denied ||
                        screen == Screen::Error || screen == Screen::Offline;
  k10->rgb->write(-1, isResult ? accent : 0x000000);
}

// The variable part of a screen, in place of the fixed copy from specFor().
void drawBody(Screen screen, const ScreenSpec& spec, const String& detail, int16_t bodyY) {
  if (screen == Screen::Granted && detail.length() > 0) {
    text(fitColumn(String("Ciao, ") + detail).c_str(), TEXT_X, bodyY, COLOR_TEXT, Canvas::eCNAndENFont16);
    return;
  }
  text(spec.body1, TEXT_X, bodyY, COLOR_MUTED, Canvas::eCNAndENFont16);
  const bool detailIsSecondLine = screen == Screen::Setup || screen == Screen::WifiSaved;
  if (detailIsSecondLine) {
    text(fitColumn(detail).c_str(), TEXT_X, bodyY + BODY_LINE_H, COLOR_TEXT, Canvas::eCNAndENFont16);
  } else {
    text(spec.body2, TEXT_X, bodyY + BODY_LINE_H, COLOR_MUTED, Canvas::eCNAndENFont16);
  }
}

}  // namespace

void uiBegin(UNIHIKER_K10& board) {
  k10 = &board;
  k10->initScreen(SCREEN_DIRECTION);
  k10->creatCanvas();
  k10->setScreenBackground(COLOR_BACKGROUND);
  k10->rgb->brightness(LED_BRIGHTNESS);
}

void uiShow(Screen screen, const String& detail) {
  if (hasShown && screen == shownScreen && detail == shownName) {
    return;
  }
  hasShown = true;
  shownScreen = screen;
  shownName = detail;

  const ScreenSpec spec = specFor(screen);
  const bool isOnline = screen != Screen::Offline && screen != Screen::Booting &&
                        screen != Screen::Setup;

  k10->canvas->canvasClear();
  drawHeader(isOnline ? COLOR_GRANTED : COLOR_WARNING);
  drawIcon(screen, spec.accent);

  text(spec.title1, TEXT_X, TITLE_Y, spec.accent, Canvas::eCNAndENFont24);
  // The pairing code takes the second title line, in the brightest colour.
  if (screen == Screen::Pairing) {
    text(detail.c_str(), TEXT_X, TITLE_Y + TITLE_LINE_H, COLOR_TEXT, Canvas::eCNAndENFont24);
  } else {
    text(spec.title2, TEXT_X, TITLE_Y + TITLE_LINE_H, spec.accent, Canvas::eCNAndENFont24);
  }

  const bool hasTwoTitleLines = spec.title2[0] != '\0' || screen == Screen::Pairing;
  drawBody(screen, spec, detail, TITLE_Y + (hasTwoTitleLines ? 2 : 1) * TITLE_LINE_H + 10);

  k10->canvas->updateCanvas();
  setLed(screen, spec.accent);
  playFeedback(screen);
}
