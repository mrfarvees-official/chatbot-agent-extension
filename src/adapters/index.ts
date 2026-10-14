import { register, setFallback } from "../core/registry";
import { gmailAdapter } from "./gmail";
import { meetAdapter } from "./meet";
import { genericAdapter } from "./generic";

register(gmailAdapter);
register(meetAdapter);
setFallback(genericAdapter);
