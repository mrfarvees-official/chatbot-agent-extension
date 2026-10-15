import { register, setFallback } from "../core/registry";
import { gmailAdapter } from "./gmail";
import { meetAdapter } from "./meet";
import { calendarAdapter } from "./calendar";
import { genericAdapter } from "./generic";

register(gmailAdapter);
register(meetAdapter);
register(calendarAdapter);
setFallback(genericAdapter);
