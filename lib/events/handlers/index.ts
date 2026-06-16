/**
 * Handler registration. Each side-effect module registers via on() at import
 * time. lib/events/index.ts imports this module to trigger registration.
 *
 * Add new handler files here as they're created.
 */
import "./recalc-attendance";
import "./recalc-service-hours";
