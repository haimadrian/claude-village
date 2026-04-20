import { createRoot } from "react-dom/client";
import App from "./App";
import { logger } from "./logger";

logger.info("renderer mounting");
const container = document.getElementById("root")!;
createRoot(container).render(<App />);
