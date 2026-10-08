#include "ui.h"

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

// Portrait 240 x 320.
constexpr uint8_t  SCREEN_DIRECTION = 2;
constexpr int16_t  MARGIN_X         = 20;
constexpr int16_t  ICON_X           = 120;
constexpr int16_t  ICON_Y           = 126;
constexpr int16_t  ICON_RADIUS      = 52;
constexpr int16_t  TITLE_Y          = 204;
constexpr int16_t  TITLE_LINE_H     = 28;
constexpr int16_t  BODY_LINE_H      = 22;
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

ScreenSpec specFor(Screen screen) {
  switch (screen) {
    case Screen::Booting:   return {COLOR_BRAND,   "Avvio",       "",           "Connessione al Wi-Fi", "in corso..."};
    case Screen::Offline:   return {COLOR_WARNING, "Wi-Fi",       "assente",    "Controlla la rete:",   "il lettore e' in pausa"};
    case Screen::Idle:      return {COLOR_BRAND,   "Pronto",      "",           "Avvicinati al lettore", "per entrare"};
    case Screen::Near:      return {COLOR_BRAND,   "Ciao!",       "",           "Avvicina il telefono", "al lettore NFC"};
    case Screen::Verifying: return {COLOR_WARNING, "Verifica",    "in corso",   "Attendi un istante",   ""};
    case Screen::Granted:   return {COLOR_GRANTED, "Accesso",     "consentito", "Puoi entrare",         ""};
    case Screen::Denied:    return {COLOR_DENIED,  "Accesso",     "negato",     "Pass non autorizzato", ""};
    case Screen::Error:     return {COLOR_WARNING, "Errore",      "",           "Server non raggiungibile", "Riprova tra poco"};
    case Screen::Setup:     return {COLOR_BRAND,   "Configura",   "dall'app",   "Apri l'app e cerca:",   ""};
    case Screen::Pairing:   return {COLOR_BRAND,   "Codice",      "",           "Inseriscilo sul telefono", "per abbinarlo"};
    case Screen::WifiSaved: return {COLOR_GRANTED, "Wi-Fi",       "aggiornato", "Connessione a:",       ""};
  }
  return {COLOR_BRAND, "", "", "", ""};
}

void text(const char* value, int16_t y, uint32_t color, Font font) {
  if (value && value[0] != '\0') {
    k10->canvas->canvasText(value, MARGIN_X, y, color, font, NO_WRAP, false);
  }
}

void drawHeader(uint32_t statusColor) {
  text("AuthLog", 14, COLOR_TEXT, Canvas::eCNAndENFont24);
  k10->canvas->canvasCircle(216, 26, 6, statusColor, statusColor, true);
}

void drawCheck(uint32_t color) {
  k10->canvas->canvasSetLineWidth(10);
  k10->canvas->canvasLine(ICON_X - 26, ICON_Y + 2, ICON_X - 8, ICON_Y + 20, color);
  k10->canvas->canvasLine(ICON_X - 8, ICON_Y + 20, ICON_X + 28, ICON_Y - 18, color);
}

void drawCross(uint32_t color) {
  k10->canvas->canvasSetLineWidth(10);
  k10->canvas->canvasLine(ICON_X - 22, ICON_Y - 22, ICON_X + 22, ICON_Y + 22, color);
  k10->canvas->canvasLine(ICON_X + 22, ICON_Y - 22, ICON_X - 22, ICON_Y + 22, color);
}

void drawExclamation(uint32_t color) {
  k10->canvas->canvasSetLineWidth(10);
  k10->canvas->canvasLine(ICON_X, ICON_Y - 30, ICON_X, ICON_Y + 6, color);
  k10->canvas->canvasCircle(ICON_X, ICON_Y + 26, 6, color, color, true);
}

// Concentric rings: the NFC "waves" while the reader is waiting.
void drawRings(uint32_t color, bool filledCore) {
  k10->canvas->canvasSetLineWidth(3);
  k10->canvas->canvasCircle(ICON_X, ICON_Y, ICON_RADIUS + 8, COLOR_SURFACE, COLOR_SURFACE, false);
  k10->canvas->canvasCircle(ICON_X, ICON_Y, ICON_RADIUS - 14, color, color, false);
  k10->canvas->canvasCircle(ICON_X, ICON_Y, ICON_RADIUS - 34, color, color, filledCore);
}

void drawIcon(Screen screen, uint32_t accent) {
  switch (screen) {
    case Screen::Granted:
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
    case Screen::WifiSaved:
      k10->canvas->canvasCircle(ICON_X, ICON_Y, ICON_RADIUS, accent, accent, true);
      drawCheck(COLOR_BACKGROUND);
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
    text((String("Ciao, ") + detail).c_str(), bodyY, COLOR_TEXT, Canvas::eCNAndENFont16);
    return;
  }
  text(spec.body1, bodyY, COLOR_MUTED, Canvas::eCNAndENFont16);
  const bool detailIsSecondLine = screen == Screen::Setup || screen == Screen::WifiSaved;
  if (detailIsSecondLine) {
    text(detail.c_str(), bodyY + BODY_LINE_H, COLOR_TEXT, Canvas::eCNAndENFont16);
  } else {
    text(spec.body2, bodyY + BODY_LINE_H, COLOR_MUTED, Canvas::eCNAndENFont16);
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

  text(spec.title1, TITLE_Y, spec.accent, Canvas::eCNAndENFont24);
  // The pairing code takes the second title line, in the brightest colour.
  if (screen == Screen::Pairing) {
    text(detail.c_str(), TITLE_Y + TITLE_LINE_H, COLOR_TEXT, Canvas::eCNAndENFont24);
  } else {
    text(spec.title2, TITLE_Y + TITLE_LINE_H, spec.accent, Canvas::eCNAndENFont24);
  }

  const bool hasTwoTitleLines = spec.title2[0] != '\0' || screen == Screen::Pairing;
  drawBody(screen, spec, detail, TITLE_Y + (hasTwoTitleLines ? 2 : 1) * TITLE_LINE_H + 8);

  k10->canvas->updateCanvas();
  setLed(screen, spec.accent);
  playFeedback(screen);
}
