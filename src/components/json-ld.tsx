import type { ReactElement } from "react";
import { serializeJsonLd, type JsonLdObject } from "@/lib/structured-data";

export function JsonLd({ data }: { data: JsonLdObject }): ReactElement {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
