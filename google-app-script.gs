const SHEET_NAME = 'Orders';
const DRIVE_FOLDER_NAME = 'PopOutPick Customisation Uploads';

const HEADERS = [
  'Order ID',
  'Created At',
  'Name',
  'Email',
  'Phone',
  'Telegram',
  'Fulfilment',
  'Meetup Date',
  'Meetup Time',
  'Meetup Location',
  'Postal Code',
  'Street',
  'Block',
  'Floor',
  'Unit',
  'Building',
  'Notes',
  'Item #',
  'Item Name',
  'Description',
  'Quantity',
  'Base Price',
  'Slider 2D Selected',
  'Slider 2D Price',
  'Slider 2D File Name',
  'Slider 2D File Link',
  'Top Plate 2D Selected',
  'Top Plate 2D Price',
  'Top Plate 2D File Name',
  'Top Plate 2D File Link',
  'Bottom Plate 2D Selected',
  'Bottom Plate 2D Price',
  'Bottom Plate 2D File Name',
  'Bottom Plate 2D File Link',
  'Top Plate 3D Selected',
  'Top Plate 3D Price',
  'Top Plate 3D File Name',
  'Top Plate 3D File Link',
  'Unit Price',
  'Line Total',
  'Pick Type',
  'Body Color',
  'Module Color',
  'Slider Color',
  'Top Plate Color',
  'Bottom Plate Color',
  'Holders JSON',
  'Add-ons JSON',
  'Design Filenames JSON',
  'Subtotal',
  'Shipping',
  'Promo Code',
  'Promo Label',
  'Discount',
  'Total',
  'Payment Method',
  'Payment Status'
];

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({
        ok: false,
        error: 'No POST data received. Submit from the website or run testDoPost().'
      });
    }

    const data = JSON.parse(e.postData.contents);
    appendOrder(data);
    return jsonResponse({ ok: true, orderId: data.orderId });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error && error.stack ? error.stack : error) });
  }
}

function appendOrder(data) {
  const sheet = getOrdersSheet();
  const folder = getUploadFolder();
  const basePrice = Number(data.basePrice || 49);

  (data.items || []).forEach((item, index) => {
    const selections = item.selections || {};
    const addOns = normaliseAddOns(item.addOns || []);
    const designFiles = saveDesignFiles(folder, data.orderId, index + 1, selections);

    const slider2d = findAddOn(addOns, 'slider', '2D');
    const top2d = findAddOn(addOns, 'top', '2D');
    const bottom2d = findAddOn(addOns, 'bottom', '2D');
    const top3d = findAddOn(addOns, 'top', '3D');

    sheet.appendRow([
      data.orderId || '',
      data.createdAt || '',
      valueAt(data, 'customer.name'),
      valueAt(data, 'customer.email'),
      valueAt(data, 'customer.phone'),
      valueAt(data, 'customer.telegram'),
      data.fulfilment || '',
      valueAt(data, 'meetup.date'),
      valueAt(data, 'meetup.time'),
      valueAt(data, 'meetup.location'),
      valueAt(data, 'delivery.postal'),
      valueAt(data, 'delivery.street'),
      valueAt(data, 'delivery.block'),
      valueAt(data, 'delivery.floor'),
      valueAt(data, 'delivery.unit'),
      valueAt(data, 'delivery.building'),
      valueAt(data, 'delivery.notes'),
      index + 1,
      item.name || '',
      item.description || '',
      item.quantity || 1,
      basePrice,
      boolText(!!slider2d),
      slider2d ? slider2d.price : '',
      valueAt(selections, 'designFileNames.slider'),
      designFiles.slider || '',
      boolText(!!top2d),
      top2d ? top2d.price : '',
      valueAt(selections, 'designFileNames.top'),
      top2d ? designFiles.top || '' : '',
      boolText(!!bottom2d),
      bottom2d ? bottom2d.price : '',
      valueAt(selections, 'designFileNames.bottom'),
      designFiles.bottom || '',
      boolText(!!top3d),
      top3d ? top3d.price : '',
      valueAt(selections, 'designFileNames.top'),
      top3d ? designFiles.top || '' : '',
      item.unitPrice || '',
      item.lineTotal || '',
      selections.type || '',
      selections.body || '',
      selections.module || '',
      selections.slider || '',
      selections.top || '',
      selections.bottom || '',
      JSON.stringify(selections.holders || []),
      JSON.stringify(item.addOns || []),
      JSON.stringify(selections.designFileNames || {}),
      valueAt(data, 'totals.subtotal'),
      valueAt(data, 'totals.shipping'),
      valueAt(data, 'totals.promoCode'),
      valueAt(data, 'totals.promoLabel'),
      valueAt(data, 'totals.discount'),
      valueAt(data, 'totals.total'),
      valueAt(data, 'payment.method'),
      valueAt(data, 'payment.status')
    ]);
  });
}

function normaliseAddOns(addOns) {
  return addOns.map(addOn => ({
    key: addOn.key || '',
    partKey: addOn.partKey || addOn.key || '',
    type: addOn.type || '',
    price: Number(addOn.price || 0),
    label: addOn.label || ''
  }));
}

function findAddOn(addOns, partKey, type) {
  return addOns.find(addOn => addOn.partKey === partKey && addOn.type === type);
}

function saveDesignFiles(folder, orderId, itemNumber, selections) {
  const images = selections.designImages || {};
  const names = selections.designFileNames || {};

  return {
    slider: saveDataUrlFile(folder, images.slider, names.slider, orderId, itemNumber, 'slider-2d'),
    top: saveDataUrlFile(folder, images.top, names.top, orderId, itemNumber, 'top-plate-design'),
    bottom: saveDataUrlFile(folder, images.bottom, names.bottom, orderId, itemNumber, 'bottom-plate-2d')
  };
}

function saveDataUrlFile(folder, dataUrl, originalName, orderId, itemNumber, label) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return '';

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return '';

  const mimeType = match[1];
  const bytes = Utilities.base64Decode(match[2]);
  const safeOriginalName = sanitiseFileName(originalName || `${label}.${extensionFromMime(mimeType)}`);
  const fileName = `${orderId || 'order'}-item${itemNumber}-${label}-${safeOriginalName}`;
  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const file = folder.createFile(blob);

  // Anyone with this link can view the uploaded customisation file.
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function getOrdersSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  ensureHeaders(sheet);
  return sheet;
}

function ensureHeaders(sheet) {
  const existingHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), HEADERS.length)).getValues()[0];
  const isMissingHeaders = existingHeaders.every(value => !value);

  if (isMissingHeaders) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    return;
  }

  HEADERS.forEach((header, index) => {
    const cell = sheet.getRange(1, index + 1);
    if (!cell.getValue()) cell.setValue(header);
  });
}

function getUploadFolder() {
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER_NAME);
}

function valueAt(obj, path) {
  return path.split('.').reduce((value, key) => value && value[key], obj) || '';
}

function boolText(value) {
  return value ? 'Yes' : 'No';
}

function sanitiseFileName(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '-');
}

function extensionFromMime(mimeType) {
  const map = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg'
  };
  return map[mimeType] || 'upload';
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function testDoPost() {
  return doPost({
    postData: {
      contents: JSON.stringify({
        orderId: `TEST-MANUAL-${Date.now()}`,
        createdAt: new Date().toISOString(),
        customer: {
          name: 'TEST CUSTOMER',
          email: 'test@example.com',
          phone: '+65 0000 0000'
        },
        fulfilment: 'meetup',
        meetup: {
          date: 'TEST DATE',
          time: 'TEST TIME',
          location: 'TEST LOCATION'
        },
        delivery: null,
        items: [{
          id: 'test-item-1',
          name: 'TEST PopOutPick Order',
          description: 'Manual Apps Script test order',
          quantity: 1,
          unitPrice: 54,
          lineTotal: 54,
          addOns: [
            { key: 'slider', partKey: 'slider', type: '2D', price: 2, label: 'Add a 2D design for $2' },
            { key: 'top', partKey: 'top', type: '3D', price: 3, label: 'Add a 3D design for $3' }
          ],
          selections: {
            type: 'guitar',
            body: '#1a1a1a',
            module: '#ffffff',
            slider: '#ffffff',
            top: '#ffffff',
            bottom: '#ffffff',
            holders: [
              { c1: '#ffffff', c2: '#ffffff', t: '10mm' },
              { c1: '#ffffff', c2: '#ffffff', t: '8mm' },
              { c1: '#ffffff', c2: '#ffffff', t: '7mm' },
              { c1: '#ffffff', c2: '#ffffff', t: '6mm' }
            ],
            designImages: {},
            designFileNames: {
              slider: 'test-slider.png',
              top: 'test-top.png',
              bottom: null
            }
          }
        }],
        totals: {
          subtotal: 54,
          shipping: 0,
          total: 54
        },
        payment: {
          method: 'TEST',
          status: 'manual_apps_script_test'
        }
      })
    }
  });
}
