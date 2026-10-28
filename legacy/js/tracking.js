// ==================== LIVEXPRESS — LIVE SHIPMENT TRACKING ====================

// Visitor tracking for tracking page
(function() {
    fetch(siteApi('/api/visitor/click'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: 'tracking.html', action: 'page_visit' })
    }).catch(function(){});
})();

function escTrack(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

async function trackShipment() {
    var input = document.getElementById('trackingNumber');
    var trackingNumber = input.value.trim().toUpperCase();
    var resultDiv = document.getElementById('trackingResult');
    var detailsDiv = document.getElementById('shipmentDetails');

    if (!trackingNumber) {
        input.focus();
        detailsDiv.innerHTML = '<div class="track-error"><i class="fas fa-exclamation-circle"></i> Please enter a tracking number.</div>';
        resultDiv.style.display = 'block';
        return;
    }

    // Show loading state
    detailsDiv.innerHTML = '<div class="track-loading"><i class="fas fa-spinner fa-spin"></i> Looking up shipment <strong>' + escTrack(trackingNumber) + '</strong>...</div>';
    resultDiv.style.display = 'block';

    // Notify admin of tracking search (fire-and-forget)
    fetch(siteApi('/api/visitor/click'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: 'tracking.html', action: 'tracking_search', trackingId: trackingNumber })
    }).catch(function(){});

    try {
        // Try server API first
        var res = await fetch(siteApi('/api/track/' + encodeURIComponent(trackingNumber)));
        if (!res.ok) throw new Error('Server error');
        var data = await res.json();

        if (data.error) {
            detailsDiv.innerHTML = renderNotFound(trackingNumber);
            return;
        }

        detailsDiv.innerHTML = renderShipmentResult(data);
    } catch (err) {
        // Server unavailable — fall back to static shipments.json
        try {
            var fallbackRes = await fetch('data/shipments.json');
            var shipments = await fallbackRes.json();
            var found = null;
            for (var i = 0; i < shipments.length; i++) {
                if (shipments[i].id === trackingNumber) { found = shipments[i]; break; }
            }
            if (found) {
                detailsDiv.innerHTML = renderShipmentResult(found);
            } else {
                detailsDiv.innerHTML = renderNotFound(trackingNumber);
            }
        } catch (fallbackErr) {
            detailsDiv.innerHTML = '<div class="track-error"><i class="fas fa-wifi"></i> Unable to load tracking data. Please try again later.</div>';
        }
    }
}

// Allow pressing Enter to search + auto-track from URL parameter
document.addEventListener('DOMContentLoaded', function() {
    var input = document.getElementById('trackingNumber');
    if (input) {
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); trackShipment(); }
        });

        // Auto-fill and track if ?id= parameter is present
        var params = new URLSearchParams(window.location.search);
        var urlId = params.get('id');
        if (urlId) {
            input.value = urlId.trim().toUpperCase();
            trackShipment();
        }
    }
});

function renderNotFound(id) {
    return '<div class="track-not-found">' +
        '<div class="track-not-found-icon"><i class="fas fa-search"></i></div>' +
        '<h3>Shipment Not Found</h3>' +
        '<p>No shipment matching <strong>' + escTrack(id) + '</strong> was found in our system.</p>' +
        '<div class="track-tips">' +
        '<p><strong>Tips:</strong></p>' +
        '<ul>' +
        '<li>Check the tracking number for typos</li>' +
        '<li>New tracking numbers start with <code>LX-</code>. Older TW- numbers are still supported.</li>' +
        '<li>New shipments may take a few minutes to appear</li>' +
        '<li>Contact details will be published before launch.</li>' +
        '</ul></div></div>';
}

function renderShipmentResult(s) {
    var statusColors = {
        'Processing': '#f59e0b', 'Loading': '#f59e0b', 'In Transit': '#3b82f6',
        'In Flight': '#3b82f6', 'Customs Clearance': '#8b5cf6', 'Out for Delivery': '#0ea5e9',
        'Delivered': '#22c55e', 'On Hold': '#ef4444', 'Delayed': '#ef4444', 'Cancelled': '#6b7280'
    };
    var statusIcons = {
        'Processing': 'fa-cog', 'Loading': 'fa-truck-loading', 'In Transit': 'fa-ship',
        'In Flight': 'fa-plane', 'Customs Clearance': 'fa-passport', 'Out for Delivery': 'fa-truck',
        'Delivered': 'fa-check-circle', 'On Hold': 'fa-pause-circle',
        'Delayed': 'fa-exclamation-triangle', 'Cancelled': 'fa-times-circle'
    };

    var color = statusColors[s.status] || '#3b82f6';
    var icon = statusIcons[s.status] || 'fa-box';
    var progress = parseInt(s.progress) || 0;

    // === 4-Step Journey Config by type ===
    var t = (s.type || '').toLowerCase();
    var journeySteps, stepIcons;
    if (t.includes('ocean') || t.includes('sea') || t.includes('fcl') || t.includes('lcl')) {
        journeySteps = ['Port of Origin', 'Ocean Transit', 'Port of Arrival', 'Final Delivery'];
        stepIcons = ['fa-anchor', 'fa-water', 'fa-city', 'fa-dolly'];
    } else if (t.includes('air') || t.includes('flight') || t.includes('awb')) {
        journeySteps = ['Departure Airport', 'In Flight', 'Arrival Airport', 'Final Delivery'];
        stepIcons = ['fa-plane-departure', 'fa-plane', 'fa-plane-arrival', 'fa-dolly'];
    } else if (t.includes('ground') || t.includes('road') || t.includes('truck') || t.includes('express')) {
        journeySteps = ['Pickup Point', 'On the Road', 'Local Distribution', 'Final Delivery'];
        stepIcons = ['fa-map-marker-alt', 'fa-truck', 'fa-warehouse', 'fa-dolly'];
    } else {
        journeySteps = ['Collection', 'In Transit', 'Customs & Arrival', 'Delivered'];
        stepIcons = ['fa-box-open', 'fa-shipping-fast', 'fa-passport', 'fa-check-double'];
    }

    // Step states: thresholds at 0%, 25%, 60%, 85%
    var thresholds = [0, 25, 60, 85, 101];
    var stepStates = journeySteps.map(function(_, i) {
        if (progress >= 100) return 'completed';
        if (progress >= thresholds[i + 1]) return 'completed';
        if (progress >= thresholds[i]) return 'active';
        return 'pending';
    });
    var completedCount = stepStates.filter(function(s) { return s === 'completed'; }).length;
    var lineWidth = completedCount === 0 ? 0 :
        completedCount >= (journeySteps.length - 1) ? 100 :
        Math.round((completedCount / (journeySteps.length - 1)) * 100);

    var html = '<div class="track-card">';

    // === Status Header ===
    html += '<div style="background:linear-gradient(135deg,' + color + '18,' + color + '06);border:1px solid ' + color + '40;border-radius:14px;padding:22px 24px;margin-bottom:22px;display:flex;align-items:center;gap:18px;flex-wrap:wrap;">' +
        '<div style="width:62px;height:62px;border-radius:50%;background:' + color + '20;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:2px solid ' + color + '30;">' +
        '<i class="fas ' + icon + '" style="font-size:26px;color:' + color + ';"></i></div>' +
        '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:22px;font-weight:800;color:' + color + ';margin-bottom:4px;">' + escTrack(s.status) + '</div>' +
        '<div style="font-size:12px;color:#64748b;font-family:\'Courier New\',monospace;font-weight:600;letter-spacing:1.2px;word-break:break-all;">' + escTrack(s.id) + '</div>' +
        '</div>' +
        '<div style="text-align:right;flex-shrink:0;">' +
        '<div id="progressCounter" style="font-size:38px;font-weight:900;color:' + color + ';line-height:1;font-variant-numeric:tabular-nums;">0%</div>' +
        '<div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;margin-top:2px;">Complete</div>' +
        '</div></div>';

    // === Animated Progress Bar ===
    html += '<div style="margin-bottom:26px;">' +
        '<div style="height:8px;background:#e2e8f0;border-radius:99px;overflow:hidden;">' +
        '<div id="progressBar" style="height:100%;width:0%;background:linear-gradient(90deg,' + color + ',' + color + 'cc);border-radius:99px;transition:width 1.2s cubic-bezier(0.4,0,0.2,1);"></div>' +
        '</div></div>';

    // === 4-Step Journey ===
    html += '<div style="background:#f8fafc;border-radius:14px;padding:22px 16px;margin-bottom:24px;border:1px solid #e2e8f0;">' +
        '<div style="font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:#94a3b8;font-weight:700;margin-bottom:20px;"><i class="fas fa-route" style="margin-right:6px;color:' + color + ';"></i>Shipment Journey</div>' +
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;position:relative;">' +
        '<div style="position:absolute;top:19px;left:calc(12.5%);right:calc(12.5%);height:3px;background:#e2e8f0;z-index:0;border-radius:3px;">' +
        '<div id="journeyLine" style="height:100%;background:' + color + ';border-radius:3px;width:0%;transition:width 1s ease 0.3s;"></div>' +
        '</div>';

    journeySteps.forEach(function(stepName, i) {
        var state = stepStates[i];
        var isCompleted = state === 'completed';
        var isActive = state === 'active';
        html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;position:relative;z-index:1;">' +
            '<div style="width:40px;height:40px;border-radius:50%;background:' + (isCompleted || isActive ? color : '#e2e8f0') + ';display:flex;align-items:center;justify-content:center;margin-bottom:10px;' +
            (isActive ? 'box-shadow:0 0 0 6px ' + color + '22,0 0 0 3px ' + color + '44;' : '') + 'transition:all 0.4s ease;">' +
            (isCompleted
                ? '<i class="fas fa-check" style="font-size:15px;color:#fff;"></i>'
                : '<i class="fas ' + stepIcons[i] + '" style="font-size:14px;color:' + (isActive ? '#fff' : '#94a3b8') + ';"></i>') +
            '</div>' +
            '<div style="font-size:11px;font-weight:' + (isActive ? '700' : isCompleted ? '600' : '400') + ';color:' + (isActive || isCompleted ? color : '#94a3b8') + ';text-align:center;line-height:1.4;max-width:75px;">' +
            (isActive ? '<span style="display:block;padding:2px 6px;background:' + color + '18;border-radius:4px;font-size:9px;color:' + color + ';font-weight:800;letter-spacing:0.5px;margin-bottom:3px;">NOW</span>' : '') +
            escTrack(stepName) + '</div></div>';
    });

    html += '</div></div>';

    // === Route Bar ===
    html += '<div class="track-route">' +
        '<div class="track-route-point">' +
        '<div class="track-route-dot origin"></div>' +
        '<div class="track-route-label"><i class="fas fa-map-pin" style="margin-right:3px;"></i>Origin</div>' +
        '<div class="track-route-city">' + escTrack(s.origin) + '</div></div>' +
        '<div class="track-route-line"><i class="fas fa-long-arrow-alt-right"></i></div>' +
        '<div class="track-route-point">' +
        '<div class="track-route-dot dest"></div>' +
        '<div class="track-route-label"><i class="fas fa-map-pin" style="margin-right:3px;"></i>Destination</div>' +
        '<div class="track-route-city">' + escTrack(s.destination) + '</div></div></div>';

    // === Live Location ===
    if (s.current_location) {
        html += '<div style="background:#f0f9ff;border-radius:10px;padding:12px 16px;margin-bottom:16px;border-left:3px solid ' + color + ';display:flex;align-items:center;gap:10px;">' +
            '<i class="fas fa-satellite-dish" style="color:' + color + ';font-size:16px;"></i>' +
            '<div><div style="font-size:10px;color:#0369a1;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Live Location</div>' +
            '<div style="font-size:14px;color:#0c4a6e;font-weight:600;">' + escTrack(s.current_location) + '</div></div></div>';
    }

    // === Delivery Address ===
    if (s.deliveryAddress) {
        html += '<div style="background:#fef3c7;border-radius:10px;padding:12px 16px;margin-bottom:16px;border-left:3px solid #f59e0b;display:flex;align-items:center;gap:12px;">' +
            '<i class="fas fa-map-marker-alt" style="color:#f59e0b;font-size:18px;flex-shrink:0;"></i>' +
            '<div><div style="font-size:10px;color:#92400e;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Delivery Address</div>' +
            '<div style="font-size:14px;color:#78350f;font-weight:600;">' + escTrack(s.deliveryAddress) + '</div></div></div>';
    }

    // === Details Grid ===
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:10px;margin-bottom:22px;">';

    function addD(label, val, ico) {
        if (!val) return;
        html += '<div style="background:#f8fafc;border-radius:10px;padding:12px 14px;border:1px solid #e2e8f0;">' +
            '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;font-weight:700;margin-bottom:5px;">' +
            (ico ? '<i class="fas ' + ico + '" style="margin-right:4px;"></i>' : '') + label + '</div>' +
            '<div style="font-size:13px;color:#1e293b;font-weight:600;word-break:break-word;">' + val + '</div></div>';
    }

    addD('Service Type', escTrack(s.type), 'fa-globe');
    addD('Est. Arrival', escTrack(s.eta), 'fa-calendar-check');
    if (s.priority && s.priority !== 'Standard') {
        var pc = { 'Critical': '#ef4444', 'Express': '#f97316', 'Priority': '#f59e0b', 'Economy': '#22c55e' }[s.priority] || '#3b82f6';
        html += '<div style="background:#f8fafc;border-radius:10px;padding:12px 14px;border:1px solid ' + pc + '40;">' +
            '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;font-weight:700;margin-bottom:5px;"><i class="fas fa-tachometer-alt" style="margin-right:4px;"></i>Priority</div>' +
            '<div style="font-size:13px;color:' + pc + ';font-weight:700;">' + escTrack(s.priority) + '</div></div>';
    }
    addD('Gross Weight', s.weight ? escTrack(String(s.weight)) + ' kg' : null, 'fa-weight-hanging');
    addD('Pieces', s.pieces && s.pieces > 1 ? s.pieces + ' pieces' : null, 'fa-cubes');
    addD('Packaging', escTrack(s.packaging), 'fa-box');
    if (s.volumetricWeight) addD('Vol. Weight', escTrack(String(s.volumetricWeight)) + ' kg', 'fa-ruler-combined');
    if (s.chargeableWeight) addD('Charg. Weight', escTrack(String(s.chargeableWeight)) + ' kg', 'fa-calculator');
    addD('Pickup Date', escTrack(s.pickupDate), 'fa-calendar-alt');
    if (s.createdAt) addD('Registered', escTrack(s.createdAt.split('T')[0]), 'fa-clock');
    if (s.cargo && s.cargo.description) addD('Cargo Desc.', escTrack(s.cargo.description), 'fa-box-open');
    if (s.cargo && s.cargo.hsCode) addD('HS Code', escTrack(s.cargo.hsCode), 'fa-barcode');
    if (s.cargo && s.cargo.insurance) addD('Insurance', escTrack(s.cargo.insurance), 'fa-shield-alt');
    if (s.incoterms) addD('Incoterms', escTrack(s.incoterms), 'fa-handshake');

    html += '</div>';

    // === Cargo Flags ===
    var flags = (s.cargo && s.cargo.flags && s.cargo.flags.length) ? s.cargo.flags : (s.flags || []);
    if (flags && flags.length > 0) {
        var flagMeta = {
            'Hazardous':   { bg: '#fef2f2', col: '#ef4444', ico: 'fa-exclamation-triangle' },
            'Fragile':     { bg: '#fff7ed', col: '#f97316', ico: 'fa-wine-glass-alt' },
            'Perishable':  { bg: '#f0fdf4', col: '#16a34a', ico: 'fa-snowflake' },
            'Oversized':   { bg: '#eff6ff', col: '#3b82f6', ico: 'fa-expand-arrows-alt' },
            'High Value':  { bg: '#fffbeb', col: '#d97706', ico: 'fa-gem' },
            'Live Animals':{ bg: '#faf5ff', col: '#7c3aed', ico: 'fa-paw' }
        };
        html += '<div style="margin-bottom:22px;">' +
            '<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;font-weight:700;margin-bottom:10px;"><i class="fas fa-tags" style="margin-right:6px;"></i>Cargo Flags</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
        flags.forEach(function(f) {
            var m = flagMeta[f] || { bg: '#f1f5f9', col: '#64748b', ico: 'fa-tag' };
            html += '<span style="display:inline-flex;align-items:center;gap:6px;padding:6px 13px;background:' + m.bg + ';color:' + m.col + ';border-radius:99px;font-size:12px;font-weight:600;border:1px solid ' + m.col + '35;">' +
                '<i class="fas ' + m.ico + '"></i> ' + escTrack(f) + '</span>';
        });
        html += '</div></div>';
    }

    // === Handling Instructions ===
    if (s.handling) {
        html += '<div style="background:#f0f9ff;border-radius:10px;padding:14px 16px;margin-bottom:18px;border-left:3px solid #0ea5e9;display:flex;align-items:flex-start;gap:10px;">' +
            '<i class="fas fa-info-circle" style="color:#0ea5e9;margin-top:1px;flex-shrink:0;"></i>' +
            '<div><div style="font-size:10px;color:#0369a1;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Handling Instructions</div>' +
            '<div style="font-size:13px;color:#0c4a6e;line-height:1.5;">' + escTrack(s.handling) + '</div></div></div>';
    }

    // === Shipping Documents ===
    if (s.documents && s.documents.length > 0) {
        var docIco = {
            'Bill of Lading': 'fa-ship', 'Air Waybill (AWB)': 'fa-plane',
            'Commercial Invoice': 'fa-file-invoice-dollar', 'Packing List': 'fa-list-ul',
            'Certificate of Origin': 'fa-certificate', 'Shipping Label': 'fa-tag',
            'Delivery Receipt': 'fa-clipboard-check', 'Customs Declaration': 'fa-passport',
            'Insurance Certificate': 'fa-shield-alt'
        };
        html += '<div style="background:#f8fafc;border-radius:14px;padding:18px;margin-bottom:22px;border:1px solid #e2e8f0;">' +
            '<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;font-weight:700;margin-bottom:14px;"><i class="fas fa-file-alt" style="margin-right:6px;color:' + color + ';"></i>Shipping Documents</div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px;">';
        s.documents.forEach(function(doc) {
            html += '<div style="display:flex;align-items:center;gap:8px;padding:9px 13px;background:#fff;border-radius:8px;border:1px solid #e2e8f0;">' +
                '<i class="fas ' + (docIco[doc] || 'fa-file') + '" style="color:#3b82f6;width:16px;flex-shrink:0;"></i>' +
                '<span style="font-size:13px;color:#374151;font-weight:500;flex:1;">' + escTrack(doc) + '</span>' +
                '<i class="fas fa-check-circle" style="color:#22c55e;font-size:13px;flex-shrink:0;"></i></div>';
        });
        html += '</div></div>';
    }

    // === Timeline ===
    if (s.timeline && s.timeline.length > 0) {
        html += '<div class="track-timeline"><h4><i class="fas fa-history"></i> Shipment Timeline</h4>';
        s.timeline.forEach(function(t) {
            var done = t.completed !== false;
            html += '<div class="track-timeline-item ' + (done ? 'completed' : 'pending') + '">' +
                '<div class="track-timeline-dot" style="background:' + (done ? color : '#cbd5e1') + ';"></div>' +
                '<div class="track-timeline-content">' +
                '<div class="track-timeline-time">' + escTrack(t.time || t.date || '') + '</div>' +
                '<div class="track-timeline-event">' + escTrack(t.status || t.event || '') + '</div>' +
                (t.location ? '<div class="track-timeline-location"><i class="fas fa-map-pin"></i> ' + escTrack(t.location) + '</div>' : '') +
                '</div></div>';
        });
        html += '</div>';
    }

    // === Additional Notes ===
    if (s.description) {
        html += '<div style="background:#f8fafc;border-radius:10px;padding:12px 16px;margin-top:16px;border-left:3px solid #94a3b8;font-size:13px;color:#64748b;line-height:1.5;">' +
            '<i class="fas fa-comment-alt" style="margin-right:8px;"></i>' + escTrack(s.description) + '</div>';
    }

    html += '</div>';

    // === Animate progress bar + counter + journey line after DOM render ===
    setTimeout(function() {
        var bar = document.getElementById('progressBar');
        var counter = document.getElementById('progressCounter');
        var line = document.getElementById('journeyLine');
        if (bar) bar.style.width = progress + '%';
        if (line) line.style.width = lineWidth + '%';
        if (counter) {
            var cur = 0;
            var inc = progress / 75;
            var timer = setInterval(function() {
                cur = Math.min(cur + inc, progress);
                counter.textContent = Math.round(cur) + '%';
                if (cur >= progress) clearInterval(timer);
            }, 16);
        }
    }, 80);

    return html;
}