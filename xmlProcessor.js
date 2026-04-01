const fs = require("node:fs/promises");
const path = require("node:path");
const { XMLParser } = require("fast-xml-parser");

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: true,
  parseAttributeValue: false
});

function normalizeKey(value) {
  return String(value || "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toArray(value) {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function coerceText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }

  if (isObject(value) && typeof value["#text"] !== "undefined") {
    return String(value["#text"]).trim();
  }

  return "";
}

function deepSearchScalars(node, visitor) {
  if (Array.isArray(node)) {
    for (const entry of node) {
      deepSearchScalars(entry, visitor);
    }
    return;
  }

  if (!isObject(node)) {
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        const text = coerceText(entry);
        if (text) {
          visitor(key, text, entry);
        }

        deepSearchScalars(entry, visitor);
      }
      continue;
    }

    const text = coerceText(value);
    if (text) {
      visitor(key, text, value);
    }

    deepSearchScalars(value, visitor);
  }
}

function findFirstScalar(node, candidateKeys) {
  const wanted = new Set(candidateKeys.map((key) => normalizeKey(key)));
  let found = "";

  deepSearchScalars(node, (key, value) => {
    if (found) {
      return;
    }

    if (wanted.has(normalizeKey(key))) {
      found = value;
    }
  });

  return found;
}

function findObjectsByPredicate(node, predicate, results = []) {
  if (Array.isArray(node)) {
    for (const entry of node) {
      findObjectsByPredicate(entry, predicate, results);
    }
    return results;
  }

  if (!isObject(node)) {
    return results;
  }

  for (const [key, value] of Object.entries(node)) {
    const values = Array.isArray(value) ? value : [value];
    for (const entry of values) {
      if (isObject(entry) && predicate(key, entry)) {
        results.push({ key, value: entry });
      }

      findObjectsByPredicate(entry, predicate, results);
    }
  }

  return results;
}

function collectFieldMap(node) {
  const map = new Map();

  deepSearchScalars(node, (key, value) => {
    const normalized = normalizeKey(key);
    if (!normalized || map.has(normalized)) {
      return;
    }

    map.set(normalized, value);
  });

  return map;
}

function getFieldValue(fieldMap, keys) {
  for (const key of keys) {
    const value = fieldMap.get(normalizeKey(key));
    if (value) {
      return value;
    }
  }

  return "";
}

function parseQuantity(value) {
  const text = String(value || "").replace(/,/g, "").trim();
  if (!text) {
    return { quantityValue: null, quantityText: "" };
  }

  const numeric = Number(text);
  return {
    quantityValue: Number.isFinite(numeric) ? numeric : null,
    quantityText: text
  };
}

function looksLikePartyNode(key, node) {
  const normalizedKey = normalizeKey(key);
  if (/(party|customer|buyer|shipto|shipfrom|delivery|recipient|consignee|soldto|billto)/.test(normalizedKey)) {
    return true;
  }

  const fieldMap = collectFieldMap(node);
  return Boolean(
    getFieldValue(fieldMap, ["PartyQualifier", "PartyType", "Role", "PartyRole", "Qualifier", "Type"]) ||
    getFieldValue(fieldMap, ["Name", "CustomerName", "ShipToName", "BuyerName", "DeliveryName"])
  );
}

function extractPartySummary(node) {
  const fieldMap = collectFieldMap(node);
  const name = getFieldValue(fieldMap, [
    "Name",
    "CustomerName",
    "ShipToName",
    "ShipName",
    "DeliveryName",
    "BuyerName",
    "SoldToName",
    "BillToName",
    "PartyName"
  ]);
  const address = [
    getFieldValue(fieldMap, ["Address1", "Street", "Street1", "AddressLine1"]),
    getFieldValue(fieldMap, ["Address2", "Street2", "AddressLine2"]),
    getFieldValue(fieldMap, ["City", "Town", "Suburb"]),
    getFieldValue(fieldMap, ["State", "Province", "Region"]),
    getFieldValue(fieldMap, ["PostalCode", "Zip", "ZipCode"]),
    getFieldValue(fieldMap, ["Country", "CountryCode"])
  ].filter(Boolean);

  return {
    name: name || address[0] || "",
    summary: [name, ...address].filter(Boolean).join(", ")
  };
}

function matchPartyRole(node, aliases) {
  const fieldMap = collectFieldMap(node);
  const values = [
    getFieldValue(fieldMap, ["PartyQualifier", "PartyType", "Role", "PartyRole", "Qualifier", "Type"]),
    getFieldValue(fieldMap, ["NameType", "EntityType"])
  ]
    .filter(Boolean)
    .map((value) => normalizeKey(value));

  return aliases.some((alias) => {
    const normalizedAlias = normalizeKey(alias);
    return values.some((value) => value.includes(normalizedAlias) || normalizedAlias.includes(value));
  });
}

function findParty(rootNode, aliases, fallbackKeys) {
  const directMatches = findObjectsByPredicate(rootNode, (key, node) =>
    aliases.some((alias) => {
      const normalizedAlias = normalizeKey(alias);
      return normalizedAlias.length > 2 && normalizeKey(key).includes(normalizedAlias);
    }) && looksLikePartyNode(key, node)
  );

  for (const candidate of directMatches) {
    const party = extractPartySummary(candidate.value);
    if (party.name || party.summary) {
      return party;
    }
  }

  const candidates = findObjectsByPredicate(rootNode, looksLikePartyNode);

  for (const candidate of candidates) {
    if (
      matchPartyRole(candidate.value, aliases) ||
      aliases.some((alias) => {
        const normalizedAlias = normalizeKey(alias);
        return normalizedAlias.length > 2 && normalizeKey(candidate.key).includes(normalizedAlias);
      })
    ) {
      const party = extractPartySummary(candidate.value);
      if (party.name || party.summary) {
        return party;
      }
    }
  }

  const fieldMap = collectFieldMap(rootNode);
  const fallback = getFieldValue(fieldMap, fallbackKeys);
  return {
    name: fallback,
    summary: fallback
  };
}

function looksLikeItemNode(key, node) {
  const normalizedKey = normalizeKey(key);
  if (["items", "lines", "details", "positions"].includes(normalizedKey)) {
    return false;
  }

  if (/(^item$|^line$|^lineitem$|product|detail|position)/.test(normalizedKey)) {
    return true;
  }

  const fieldMap = collectFieldMap(node);
  const hasCode = Boolean(getFieldValue(fieldMap, [
    "ItemCode",
    "ProductCode",
    "ItemNumber",
    "Sku",
    "SKU",
    "BuyerItemCode",
    "SupplierItemCode",
    "GTIN",
    "EAN",
    "UPC"
  ]));
  const hasQuantity = Boolean(getFieldValue(fieldMap, [
    "Quantity",
    "Qty",
    "ShippedQuantity",
    "OrderedQuantity",
    "DespatchedQuantity"
  ]));
  const hasDescription = Boolean(getFieldValue(fieldMap, [
    "Description",
    "ItemDescription",
    "ProductDescription",
    "Name"
  ]));

  return hasQuantity && (hasCode || hasDescription);
}

function extractItem(node, lineNumber) {
  const fieldMap = collectFieldMap(node);
  const itemCode = getFieldValue(fieldMap, [
    "ItemCode",
    "ProductCode",
    "ItemNumber",
    "Sku",
    "SKU",
    "BuyerItemCode",
    "SupplierItemCode",
    "GTIN",
    "EAN",
    "UPC"
  ]);
  const description = getFieldValue(fieldMap, [
    "Description",
    "ItemDescription",
    "ProductDescription",
    "ProductName",
    "Name"
  ]);
  const quantity = parseQuantity(getFieldValue(fieldMap, [
    "Quantity",
    "Qty",
    "ShippedQuantity",
    "OrderedQuantity",
    "DespatchedQuantity"
  ]));
  const uom = getFieldValue(fieldMap, [
    "UOM",
    "UnitOfMeasure",
    "Unit",
    "MeasureUnit"
  ]);

  if (!itemCode && !description && !quantity.quantityText) {
    return null;
  }

  return {
    lineNumber,
    itemCode,
    description,
    quantityValue: quantity.quantityValue,
    quantityText: quantity.quantityText,
    uom
  };
}

function extractItems(rootNode) {
  const candidates = findObjectsByPredicate(rootNode, looksLikeItemNode);
  const seen = new Set();
  const items = [];

  for (const candidate of candidates) {
    const key = JSON.stringify(candidate.value);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    const item = extractItem(candidate.value, items.length + 1);
    if (item) {
      items.push(item);
    }
  }

  return items;
}

function buildItemPreview(items) {
  if (!items.length) {
    return "";
  }

  const preview = items.slice(0, 3).map((item) => {
    const label = item.itemCode || item.description || `Line ${item.lineNumber}`;
    const quantity = item.quantityText ? ` x${item.quantityText}` : "";
    return `${label}${quantity}`;
  });

  if (items.length > 3) {
    preview.push(`+${items.length - 3} more`);
  }

  return preview.join(", ");
}

function sumItemQuantities(items) {
  return items.reduce((sum, item) => sum + (Number.isFinite(item.quantityValue) ? item.quantityValue : 0), 0);
}

async function parseXmlSnapshot(snapshotPath, context = {}) {
  const parsedAt = new Date().toISOString();

  try {
    const xmlText = await fs.readFile(snapshotPath, "utf8");
    const parsedXml = parser.parse(xmlText);
    const rootName = Object.keys(parsedXml || {}).find((key) => !String(key).startsWith("?")) || Object.keys(parsedXml || {})[0];
    const rootNode = rootName ? parsedXml[rootName] : parsedXml;

    if (!rootNode || (!isObject(rootNode) && !Array.isArray(rootNode))) {
      return {
        parseStatus: "failed",
        parseMessage: "XML parsed but no document structure was found.",
        parsedAt,
        documentType: rootName || path.extname(snapshotPath).replace(".", "").toUpperCase(),
        recordKey: context.fileName || path.basename(snapshotPath),
        orderNumber: "",
        orderDate: "",
        shipTo: "",
        customerName: "",
        itemCount: 0,
        totalQty: 0,
        itemPreview: "",
        items: []
      };
    }

    const fieldMap = collectFieldMap(rootNode);
    const orderNumber = getFieldValue(fieldMap, [
      "OrderNumber",
      "OrderNo",
      "OrderID",
      "PurchaseOrderNumber",
      "PONumber",
      "PoNumber",
      "DocumentNumber",
      "ShipmentNumber",
      "DespatchAdviceNumber",
      "DespatchNumber",
      "ReferenceNumber"
    ]);
    const orderDate = getFieldValue(fieldMap, [
      "OrderDate",
      "DocumentDate",
      "ShipmentDate",
      "ShipDate",
      "DespatchDate",
      "CreationDate",
      "IssueDate"
    ]) || findFirstScalar(rootNode, ["OrderDate", "DocumentDate", "ShipmentDate", "ShipDate"]);
    const shipToParty = findParty(rootNode, ["shipto", "delivery", "st", "consignee", "recipient"], [
      "ShipToName",
      "DeliveryName",
      "RecipientName",
      "ConsigneeName"
    ]);
    const customerParty = findParty(rootNode, ["customer", "buyer", "soldto", "billto", "by"], [
      "CustomerName",
      "BuyerName",
      "SoldToName",
      "BillToName"
    ]);
    const items = extractItems(rootNode);
    const recordKey = orderNumber || context.fileName || path.basename(snapshotPath);

    return {
      parseStatus: "success",
      parseMessage: "",
      parsedAt,
      documentType: rootName || path.extname(snapshotPath).replace(".", "").toUpperCase(),
      recordKey,
      orderNumber,
      orderDate,
      shipTo: shipToParty.summary,
      customerName: customerParty.name || customerParty.summary,
      itemCount: items.length,
      totalQty: sumItemQuantities(items),
      itemPreview: buildItemPreview(items),
      items
    };
  } catch (error) {
    return {
      parseStatus: "failed",
      parseMessage: error.message,
      parsedAt,
      documentType: path.extname(snapshotPath).replace(".", "").toUpperCase() || "XML",
      recordKey: context.fileName || path.basename(snapshotPath),
      orderNumber: "",
      orderDate: "",
      shipTo: "",
      customerName: "",
      itemCount: 0,
      totalQty: 0,
      itemPreview: "",
      items: []
    };
  }
}

module.exports = {
  parseXmlSnapshot
};
