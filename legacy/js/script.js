// =====================================================
// LIVEXPRESS - Main Script
// =====================================================

// ==========================================
// DATA PERSISTENCE & FORM STATE MANAGEMENT
// ==========================================

const FormDataManager = {
    storageKey: 'livexpress_form_data',
    trackingKey: 'livexpress_tracking_history',

    saveFormData: function(formData) {
        try {
            const existing = this.getFormData();
            const merged = { ...existing, ...formData };
            localStorage.setItem(this.storageKey, JSON.stringify(merged));
            return true;
        } catch (e) { return false; }
    },

    getFormData: function() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : {};
        } catch (e) { return {}; }
    },

    clearFormData: function() {
        try { localStorage.removeItem(this.storageKey); return true; }
        catch (e) { return false; }
    },

    saveTrackingHistory: function(trackingNumber) {
        try {
            const history = this.getTrackingHistory();
            if (!history.includes(trackingNumber)) {
                history.unshift(trackingNumber);
                if (history.length > 10) history.pop();
                localStorage.setItem(this.trackingKey, JSON.stringify(history));
            }
            return true;
        } catch (e) { return false; }
    },

    getTrackingHistory: function() {
        try {
            const history = localStorage.getItem(this.trackingKey);
            return history ? JSON.parse(history) : [];
        } catch (e) { return []; }
    },

    clearTrackingHistory: function() {
        try { localStorage.removeItem(this.trackingKey); return true; }
        catch (e) { return false; }
    }
};


// ==========================================
// NAVIGATION
// ==========================================

function toggleMobileMenu() {
    const menu = document.getElementById('navMenu');
    if (menu) menu.classList.toggle('active');
}

function initNavbar() {
    const navbar = document.getElementById('mainNav');
    if (!navbar) return;
    
    var scrollTicking = false;
    window.addEventListener('scroll', function() {
        if (!scrollTicking) {
            scrollTicking = true;
            requestAnimationFrame(function() {
                if (window.scrollY > 80) {
                    navbar.classList.add('scrolled');
                } else {
                    navbar.classList.remove('scrolled');
                }
                scrollTicking = false;
            });
        }
    }, { passive: true });

    // Close mobile menu when clicking a link
    document.querySelectorAll('.nav-link').forEach(function(link) {
        link.addEventListener('click', function() {
            var menu = document.getElementById('navMenu');
            if (menu) menu.classList.remove('active');
        });
    });
}


// ==========================================
// HERO STAT COUNTER ANIMATION
// ==========================================

function animateCounters() {
    var counters = document.querySelectorAll('.stat-number[data-target]');
    counters.forEach(function(counter) {
        var target = parseInt(counter.getAttribute('data-target'));
        var duration = 2500;
        var startTime = null;

        function easeOutExpo(t) {
            return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        }

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            var progress = Math.min((timestamp - startTime) / duration, 1);
            var easedProgress = easeOutExpo(progress);
            var current = Math.floor(easedProgress * target);
            counter.textContent = current.toLocaleString();
            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                counter.textContent = target.toLocaleString();
                startLivePulse(counter, target);
            }
        }
        requestAnimationFrame(step);
    });
}

function startLivePulse(counter, baseTarget) {
    var label = counter.nextElementSibling ? counter.nextElementSibling.textContent.trim() : '';
    if (label === 'Daily Shipments') {
        var current = baseTarget;
        function gentleTick() {
            current += 1;
            counter.textContent = current.toLocaleString();
            var nextDelay = 6000 + Math.floor(Math.random() * 9000);
            setTimeout(gentleTick, nextDelay);
        }
        setTimeout(gentleTick, 8000);
    } else if (label === 'Countries') {
        setInterval(function() {
            var tick = Math.floor(Math.random() * 3);
            counter.textContent = (baseTarget + tick).toLocaleString();
        }, 8000);
    } else if (label === '% On-Time') {
        var values = [98.7, 99.1, 98.9, 99.3, 99.0, 98.8, 99.2];
        var idx = 0;
        setInterval(function() {
            counter.textContent = values[idx % values.length].toFixed(1);
            idx++;
        }, 5000);
    }
}


// ==========================================
// SHIPPING COST CALCULATOR
// ==========================================

var distanceMatrix = {
    newyork: { london: 5571, shanghai: 11862, dubai: 11014, singapore: 15345, tokyo: 10838, sydney: 16014, mumbai: 12555, rotterdam: 5862, hamburg: 6189, lagos: 8305, saopaulo: 7687 },
    london: { newyork: 5571, shanghai: 9205, dubai: 5478, singapore: 10862, tokyo: 9555, sydney: 16983, mumbai: 7192, rotterdam: 358, hamburg: 736, lagos: 5020, saopaulo: 9474 },
    shanghai: { newyork: 11862, london: 9205, dubai: 7405, singapore: 3830, tokyo: 1768, sydney: 7892, mumbai: 4618, rotterdam: 19552, hamburg: 19200, lagos: 12925, saopaulo: 18695 },
    dubai: { newyork: 11014, london: 5478, shanghai: 7405, singapore: 5849, tokyo: 7828, sydney: 12042, mumbai: 1933, rotterdam: 5837, hamburg: 6116, lagos: 6270, saopaulo: 13045 },
    singapore: { newyork: 15345, london: 10862, shanghai: 3830, dubai: 5849, tokyo: 5314, sydney: 6290, mumbai: 3926, rotterdam: 15364, hamburg: 15100, lagos: 10912, saopaulo: 16700 },
    tokyo: { newyork: 10838, london: 9555, shanghai: 1768, dubai: 7828, singapore: 5314, sydney: 7828, mumbai: 6737, rotterdam: 9430, hamburg: 9090, lagos: 13900, saopaulo: 18552 },
    sydney: { newyork: 16014, london: 16983, shanghai: 7892, dubai: 12042, singapore: 6290, tokyo: 7828, mumbai: 10381, rotterdam: 16693, hamburg: 16481, lagos: 16565, saopaulo: 13595 },
    mumbai: { newyork: 12555, london: 7192, shanghai: 4618, dubai: 1933, singapore: 3926, tokyo: 6737, sydney: 10381, rotterdam: 7548, hamburg: 7640, lagos: 7568, saopaulo: 14343 },
    lagos: { newyork: 8305, london: 5020, shanghai: 12925, dubai: 6270, singapore: 10912, tokyo: 13900, sydney: 16565, mumbai: 7568, rotterdam: 5260, hamburg: 5490, saopaulo: 4785 },
    saopaulo: { newyork: 7687, london: 9474, shanghai: 18695, dubai: 13045, singapore: 16700, tokyo: 18552, sydney: 13595, mumbai: 14343, rotterdam: 9816, hamburg: 10070, lagos: 4785 },
    rotterdam: { newyork: 5862, london: 358, shanghai: 19552, dubai: 5837, singapore: 15364, tokyo: 9430, sydney: 16693, mumbai: 7548, hamburg: 472, lagos: 5260, saopaulo: 9816 },
    hamburg: { newyork: 6189, london: 736, shanghai: 19200, dubai: 6116, singapore: 15100, tokyo: 9090, sydney: 16481, mumbai: 7640, rotterdam: 472, lagos: 5490, saopaulo: 10070 }
};

var cityLabels = {
    newyork: 'New York', london: 'London', shanghai: 'Shanghai', dubai: 'Dubai',
    singapore: 'Singapore', tokyo: 'Tokyo', sydney: 'Sydney', mumbai: 'Mumbai',
    lagos: 'Lagos', saopaulo: 'São Paulo', rotterdam: 'Rotterdam', hamburg: 'Hamburg'
};

function calculateShipping() {
    var origin = document.getElementById('calcOrigin').value;
    var dest = document.getElementById('calcDestination').value;
    var weight = parseFloat(document.getElementById('calcWeight').value);
    var method = document.getElementById('calcMethod').value;
    var pkgType = document.getElementById('calcType').value;
    var length = parseFloat(document.getElementById('calcLength').value) || 0;
    var width = parseFloat(document.getElementById('calcWidth').value) || 0;
    var height = parseFloat(document.getElementById('calcHeight').value) || 0;

    var insurance = document.getElementById('calcInsurance').checked;
    var signature = document.getElementById('calcSignature').checked;
    var tracking = document.getElementById('calcTracking').checked;

    // Validation
    if (!origin || !dest) { showAlert('Please select both origin and destination', 'error'); return; }
    if (origin === dest) { showAlert('Origin and destination cannot be the same', 'error'); return; }
    if (!weight || weight <= 0) { showAlert('Please enter a valid weight', 'error'); return; }

    // Get distance
    var dist = (distanceMatrix[origin] && distanceMatrix[origin][dest]) || 8000;

    // Base rate per kg based on method
    var rates = {
        economy: 1.20,
        standard: 2.50,
        express: 5.80,
        overnight: 12.50,
        ocean: 0.45
    };

    var etaDays = {
        economy: '7-14 days',
        standard: '5-7 days',
        express: '2-3 days',
        overnight: 'Next Business Day',
        ocean: '21-45 days'
    };

    // Calculate volumetric weight if dimensions provided
    var volumetricWeight = (length * width * height) / 5000;
    var chargeableWeight = Math.max(weight, volumetricWeight);

    // Base cost
    var baseCost = chargeableWeight * rates[method];

    // Distance factor
    baseCost *= (1 + (dist / 20000));

    // Package type multipliers
    var typeMultipliers = { parcel: 1.0, document: 0.8, fragile: 1.35, hazmat: 1.8, pallet: 1.5 };
    baseCost *= (typeMultipliers[pkgType] || 1.0);

    // Minimum charge
    baseCost = Math.max(baseCost, 15);

    // Extras
    var extrasCost = 0;
    if (insurance) extrasCost += 15;
    if (signature) extrasCost += 5;
    if (tracking) extrasCost += 10;

    var total = baseCost + extrasCost;

    // Display result
    document.getElementById('resultRoute').textContent = (cityLabels[origin] || origin) + ' → ' + (cityLabels[dest] || dest);
    document.getElementById('resultMethod').textContent = method.charAt(0).toUpperCase() + method.slice(1);
    document.getElementById('resultWeight').textContent = chargeableWeight.toFixed(1) + ' kg' + (volumetricWeight > weight ? ' (volumetric)' : '');
    document.getElementById('resultETA').textContent = etaDays[method];
    document.getElementById('resultBase').textContent = '$' + baseCost.toFixed(2);
    document.getElementById('resultExtras').textContent = extrasCost > 0 ? '$' + extrasCost.toFixed(2) : 'None';
    document.getElementById('resultTotal').textContent = '$' + total.toFixed(2);

    document.getElementById('calcResult').style.display = 'block';
    document.getElementById('calcResult').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function bookShipment() {
    showAlert('Booking submitted! Our team will contact you within 1 hour to confirm.', 'success');
}


// ==========================================
// SATELLITE/STREET MAP TRACKING
// ==========================================

var trackingMap = null;
var currentMapLayer = null;
var routePolyline = null;
var shipmentMarkers = [];

var tileLayers = {
    street: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    },
    satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: '&copy; Esri &mdash; Earthstar Geographics',
        maxZoom: 18
    },
    terrain: {
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        attribution: '&copy; OpenTopoMap contributors',
        maxZoom: 17
    }
};

function initTrackingMap() {
    var mapEl = document.getElementById('trackingMap');
    if (!mapEl || trackingMap) return;

    trackingMap = L.map('trackingMap', {
        center: [25, 30],
        zoom: 3,
        zoomControl: true,
        scrollWheelZoom: true
    });

    setMapView('street');
    addDemoShipmentRoutes();
}

function setMapView(type) {
    if (!trackingMap) return;
    
    // Update active button
    document.querySelectorAll('.map-ctrl').forEach(function(btn) { btn.classList.remove('active'); });
    var activeBtn = document.querySelector('.map-ctrl[onclick="setMapView(\'' + type + '\')"]');
    if (activeBtn) activeBtn.classList.add('active');

    // Remove current layer
    if (currentMapLayer) trackingMap.removeLayer(currentMapLayer);

    var layerConfig = tileLayers[type] || tileLayers.street;
    currentMapLayer = L.tileLayer(layerConfig.url, {
        attribution: layerConfig.attribution,
        maxZoom: layerConfig.maxZoom
    });
    currentMapLayer.addTo(trackingMap);
}

function addDemoShipmentRoutes() {
    if (!trackingMap) return;

    // City coordinate lookup for geocoding origin/destination names
    var cityCoords = {
        'shanghai': { lat: 31.23, lng: 121.47 }, 'singapore': { lat: 1.35, lng: 103.82 },
        'rotterdam': { lat: 51.92, lng: 4.48 }, 'los angeles': { lat: 33.94, lng: -118.41 },
        'dubai': { lat: 25.28, lng: 55.30 }, 'hamburg': { lat: 53.55, lng: 9.99 },
        'tokyo': { lat: 35.68, lng: 139.69 }, 'sydney': { lat: -33.87, lng: 151.21 },
        'london': { lat: 51.51, lng: -0.13 }, 'new york': { lat: 40.71, lng: -74.01 },
        'mumbai': { lat: 19.08, lng: 72.88 }, 'sao paulo': { lat: -23.55, lng: -46.63 },
        'hong kong': { lat: 22.32, lng: 114.17 }, 'busan': { lat: 35.18, lng: 129.08 },
        'jeddah': { lat: 21.49, lng: 39.19 }, 'miami': { lat: 25.76, lng: -80.19 },
        'frankfurt': { lat: 50.04, lng: 8.56 }, 'johannesburg': { lat: -26.20, lng: 28.05 },
        'lagos': { lat: 6.52, lng: 3.38 }, 'nairobi': { lat: -1.29, lng: 36.82 },
        'bangkok': { lat: 13.76, lng: 100.50 }, 'istanbul': { lat: 41.01, lng: 28.98 },
        'cape town': { lat: -33.93, lng: 18.42 }, 'toronto': { lat: 43.65, lng: -79.38 },
        'vancouver': { lat: 49.28, lng: -123.12 }, 'melbourne': { lat: -37.81, lng: 144.96 },
        'lima': { lat: -12.05, lng: -77.03 }, 'karachi': { lat: 24.86, lng: 67.01 },
        'la': { lat: 33.94, lng: -118.41 }, 'nyc': { lat: 40.71, lng: -74.01 },
        'ny': { lat: 40.71, lng: -74.01 }, 'uae': { lat: 25.28, lng: 55.30 },
        'uk': { lat: 51.51, lng: -0.13 }, 'us': { lat: 38.89, lng: -77.04 },
        'korea': { lat: 37.57, lng: 126.98 }, 'china': { lat: 31.23, lng: 121.47 },
        'japan': { lat: 35.68, lng: 139.69 }, 'india': { lat: 19.08, lng: 72.88 },
        'brazil': { lat: -23.55, lng: -46.63 }, 'germany': { lat: 50.04, lng: 8.56 },
        'france': { lat: 48.86, lng: 2.35 }, 'paris': { lat: 48.86, lng: 2.35 },
        'amsterdam': { lat: 52.37, lng: 4.90 }, 'antwerp': { lat: 51.22, lng: 4.40 },
        'shenzhen': { lat: 22.54, lng: 114.06 }, 'guangzhou': { lat: 23.13, lng: 113.26 },
        'dalian': { lat: 38.91, lng: 121.60 }, 'tianjin': { lat: 39.09, lng: 117.20 },
        'qingdao': { lat: 36.07, lng: 120.38 }, 'xiamen': { lat: 24.48, lng: 118.09 },
        'port klang': { lat: 3.00, lng: 101.39 }, 'felixstowe': { lat: 51.96, lng: 1.35 },
        'savannah': { lat: 32.13, lng: -81.16 }, 'houston': { lat: 29.95, lng: -95.07 },
        'seattle': { lat: 47.45, lng: -122.31 }, 'long beach': { lat: 33.75, lng: -118.22 },
        // Shipping waypoints & transit zones
        'suez canal': { lat: 30.42, lng: 32.35 }, 'suez canal area': { lat: 30.42, lng: 32.35 },
        'suez': { lat: 30.42, lng: 32.35 }, 'strait of malacca': { lat: 2.50, lng: 103.50 },
        'malacca strait': { lat: 2.50, lng: 103.50 }, 'malacca': { lat: 2.50, lng: 103.50 },
        'strait of hormuz': { lat: 26.57, lng: 56.25 }, 'hormuz': { lat: 26.57, lng: 56.25 },
        'bab el-mandeb': { lat: 12.60, lng: 43.30 }, 'red sea': { lat: 22.00, lng: 38.00 },
        'gulf of aden': { lat: 12.00, lng: 48.00 }, 'arabian sea': { lat: 15.00, lng: 65.00 },
        'indian ocean': { lat: -10.00, lng: 70.00 }, 'bay of bengal': { lat: 15.00, lng: 90.00 },
        'south china sea': { lat: 12.00, lng: 113.00 }, 'east china sea': { lat: 28.00, lng: 125.00 },
        'pacific ocean': { lat: 20.00, lng: -160.00 }, 'north pacific': { lat: 40.00, lng: -170.00 },
        'south pacific': { lat: -20.00, lng: -150.00 }, 'atlantic ocean': { lat: 20.00, lng: -35.00 },
        'north atlantic': { lat: 45.00, lng: -35.00 }, 'south atlantic': { lat: -20.00, lng: -15.00 },
        'mediterranean sea': { lat: 36.00, lng: 15.00 }, 'mediterranean': { lat: 36.00, lng: 15.00 },
        'north sea': { lat: 56.00, lng: 3.00 }, 'english channel': { lat: 50.50, lng: 1.00 },
        'panama canal': { lat: 9.08, lng: -79.68 }, 'panama': { lat: 9.08, lng: -79.68 },
        'cape of good hope': { lat: -34.36, lng: 18.48 }, 'good hope': { lat: -34.36, lng: 18.48 },
        'cape horn': { lat: -55.98, lng: -67.27 }, 'strait of gibraltar': { lat: 35.98, lng: -5.48 },
        'gibraltar': { lat: 35.98, lng: -5.48 }, 'persian gulf': { lat: 26.00, lng: 52.00 },
        'gulf of mexico': { lat: 25.00, lng: -90.00 }, 'caribbean sea': { lat: 15.00, lng: -75.00 },
        'central asia airspace': { lat: 43.00, lng: 68.00 }, 'central asia': { lat: 43.00, lng: 68.00 },
        'europe airspace': { lat: 50.00, lng: 10.00 }, 'middle east': { lat: 25.00, lng: 45.00 },
        'west africa': { lat: 5.00, lng: 2.00 }, 'east africa': { lat: -5.00, lng: 40.00 },
        'gulf of guinea': { lat: 2.00, lng: 3.00 }, 'mozambique channel': { lat: -18.00, lng: 40.00 }
    };

    var routeColors = ['#E63946', '#1D3557', '#E8C84A', '#00b4d8', '#8b5cf6', '#22c55e', '#f97316'];

    function getCityCoords(name) {
        if (!name) return null;
        var key = name.toLowerCase().trim();
        return cityCoords[key] || null;
    }

    function currentPosition(a, b, progress, current_location) {
        // If current_location resolves to known coordinates, use those — exact match
        if (current_location) {
            var locCoords = getCityCoords(current_location);
            if (locCoords) return locCoords;
        }
        // Fall back to proportional midpoint along route line
        var frac = Math.min(Math.max((progress || 50) / 100, 0.05), 0.95);
        return { lat: a.lat + (b.lat - a.lat) * frac, lng: a.lng + (b.lng - a.lng) * frac };
    }

    function plotRoutes(routes) {
        // Clear existing markers
        shipmentMarkers.forEach(function(m) { trackingMap.removeLayer(m); });
        shipmentMarkers = [];

        routes.forEach(function(route, i) {
            var originCoords = getCityCoords(route.origin);
            var destCoords = getCityCoords(route.destination);
            if (!originCoords || !destCoords) return;

            var color = routeColors[i % routeColors.length];
            var current = currentPosition(originCoords, destCoords, route.progress, route.current_location);

            // Origin marker (green)
            var m1 = L.circleMarker([originCoords.lat, originCoords.lng], {
                radius: 8, fillColor: '#28a745', color: '#1a7a31', weight: 2, fillOpacity: 0.9
            }).addTo(trackingMap).bindPopup(
                '<strong>Origin:</strong> ' + route.origin + '<br>' +
                '<strong>Shipment:</strong> ' + route.id
            );
            shipmentMarkers.push(m1);

            // Destination marker (gold)
            var m2 = L.circleMarker([destCoords.lat, destCoords.lng], {
                radius: 8, fillColor: '#E8C84A', color: '#c79100', weight: 2, fillOpacity: 0.9
            }).addTo(trackingMap).bindPopup(
                '<strong>Destination:</strong> ' + route.destination + '<br>' +
                '<strong>Shipment:</strong> ' + route.id
            );
            shipmentMarkers.push(m2);

            // Current position marker (colored, pulsing)
            var m3 = L.circleMarker([current.lat, current.lng], {
                radius: 10, fillColor: color, color: '#fff', weight: 3, fillOpacity: 1
            }).addTo(trackingMap).bindPopup(
                '<strong>Shipment:</strong> ' + route.id + '<br>' +
                '<strong>Status:</strong> ' + route.status + '<br>' +
                '<strong>Type:</strong> ' + (route.type || '') + '<br>' +
                '<strong>Progress:</strong> ' + (route.progress || 0) + '%' +
                (route.current_location ? '<br><strong>Location:</strong> ' + route.current_location : '')
            );
            shipmentMarkers.push(m3);

            // Route line (dashed — full route)
            var line1 = L.polyline([
                [originCoords.lat, originCoords.lng],
                [current.lat, current.lng],
                [destCoords.lat, destCoords.lng]
            ], { color: color, weight: 2, opacity: 0.6, dashArray: '8, 8' }).addTo(trackingMap);
            shipmentMarkers.push(line1);

            // Traveled portion (solid)
            var line2 = L.polyline([
                [originCoords.lat, originCoords.lng],
                [current.lat, current.lng]
            ], { color: color, weight: 3, opacity: 0.9 }).addTo(trackingMap);
            shipmentMarkers.push(line2);
        });
    }

    // Demo fallback routes (shown when no real shipments exist)
    var demoRoutes = [
        { id: 'LX-2026-001', origin: 'Shanghai', destination: 'Rotterdam', status: 'In Transit', type: 'Ocean Freight', progress: 65, current_location: 'Suez Canal Area' },
        { id: 'LX-2026-002', origin: 'Los Angeles', destination: 'Singapore', status: 'In Transit', type: 'Air Cargo', progress: 45, current_location: 'Pacific Ocean' },
        { id: 'LX-2026-003', origin: 'Frankfurt', destination: 'Tokyo', status: 'In Flight', type: 'Air Cargo', progress: 72, current_location: 'Central Asia Airspace' }
    ];

    // Try to fetch real active shipments from server, fall back to static JSON, then demo
    fetch(siteApi('/api/map/shipments'))
        .then(function(res) {
            if (!res.ok) throw new Error('Server unavailable');
            return res.json();
        })
        .then(function(data) {
            if (data && data.length > 0) {
                plotRoutes(data);
            } else {
                plotRoutes(demoRoutes);
            }
        })
        .catch(function() {
            // Try static shipments.json
            fetch('data/shipments.json')
                .then(function(res) { return res.json(); })
                .then(function(shipments) {
                    var active = shipments.filter(function(s) {
                        return s.status && s.status !== 'Delivered' && s.status !== 'Cancelled';
                    });
                    if (active.length > 0) {
                        plotRoutes(active);
                    } else {
                        plotRoutes(demoRoutes);
                    }
                })
                .catch(function() { plotRoutes(demoRoutes); });
        });
}


// ==========================================
// VISITOR TRACKING & COUNTRY DETECTION
// ==========================================

var VisitorTracker = {
    cookieName: 'livexpress_visitor_geo',

    getCookie: function(name) {
        var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? decodeURIComponent(match[2]) : null;
    },

    setCookie: function(name, value, days) {
        var d = new Date();
        d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
    },

    getGeo: function() {
        var raw = this.getCookie(this.cookieName);
        if (raw) {
            try { return JSON.parse(raw); } catch(e) {}
        }
        return null;
    },

    trackPageVisit: function() {
        var self = this;
        var page = window.location.pathname.replace(/^\//, '') || 'homepage';
        fetch(siteApi('/api/visitor/click'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page: page, action: 'page_visit' })
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data.country) {
                self.setCookie(self.cookieName, JSON.stringify({
                    country: data.country,
                    city: data.city || '',
                    countryCode: data.countryCode || ''
                }), 30);
            }
        })
        .catch(function() {});
    },

    trackClick: function(action, extra) {
        var page = window.location.pathname.replace(/^\//, '') || 'homepage';
        var body = { page: page, action: action };
        if (extra) {
            if (extra.trackingId) body.trackingId = extra.trackingId;
        }
        fetch(siteApi('/api/visitor/click'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).catch(function() {});
    }
};


// ==========================================
// TRACKING SEARCH (inline results on homepage)
// ==========================================

function escHtml(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function handleTrackingSearch(event) {
    event.preventDefault();
    var input = document.getElementById('trackingNumber');
    var trackingNumber = input.value.trim().toUpperCase();
    var errorDiv = document.getElementById('searchError');
    var resultDiv = document.getElementById('homeTrackingResult');
    var detailsDiv = document.getElementById('homeShipmentDetails');

    if (!trackingNumber) {
        showError(errorDiv, 'Please enter a tracking number');
        if (resultDiv) resultDiv.style.display = 'none';
        return;
    }

    // Accept new LIVEXPRESS IDs and existing shipment IDs.
    if (!/^(?:LX|TW)-[A-Z0-9-]{5,40}$/.test(trackingNumber)) {
        showError(errorDiv, 'Invalid format. Use: LX-AIR-LASI-260325-123456-A1');
        if (resultDiv) resultDiv.style.display = 'none';
        return;
    }

    errorDiv.textContent = '';
    FormDataManager.saveTrackingHistory(trackingNumber);
    showTrackingHistory();

    // Show loading state
    if (resultDiv && detailsDiv) {
        resultDiv.style.display = 'block';
        detailsDiv.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#64748b;"><i class="fas fa-spinner fa-spin" style="font-size:2rem;color:var(--livexpress-red);"></i><p style="margin-top:12px;font-weight:600;">Looking up shipment <strong>' + escHtml(trackingNumber) + '</strong>...</p></div>';
    }

    // Fetch shipment data — try server API first, fall back to static JSON
    VisitorTracker.trackClick('tracking_search', { trackingId: trackingNumber });

    function processTrackResult(shipments) {
        var shipment = null;
        for (var i = 0; i < shipments.length; i++) {
            if (shipments[i].id === trackingNumber) { shipment = shipments[i]; break; }
        }
        if (!shipment) {
            detailsDiv.innerHTML = renderHomeNotFound(trackingNumber);
            var link = document.getElementById('fullTrackingLink');
            if (link) link.style.display = 'none';
            return;
        }
        detailsDiv.innerHTML = renderHomeTrackingResult(shipment);
        var link = document.getElementById('fullTrackingLink');
        if (link) {
            link.href = 'tracking.html?id=' + encodeURIComponent(trackingNumber);
            link.style.display = 'inline-block';
        }
        resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    fetch(siteApi('/api/track/' + encodeURIComponent(trackingNumber)))
        .then(function(res) {
            if (!res.ok) throw new Error('Server error');
            return res.json();
        })
        .then(function(data) {
            if (data.error) {
                detailsDiv.innerHTML = renderHomeNotFound(trackingNumber);
                var link = document.getElementById('fullTrackingLink');
                if (link) link.style.display = 'none';
                return;
            }
            detailsDiv.innerHTML = renderHomeTrackingResult(data);
            var link = document.getElementById('fullTrackingLink');
            if (link) {
                link.href = 'tracking.html?id=' + encodeURIComponent(trackingNumber);
                link.style.display = 'inline-block';
            }
            resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        })
        .catch(function() {
            // Server unavailable — fall back to static shipments.json
            fetch('data/shipments.json')
                .then(function(res) { return res.json(); })
                .then(function(shipments) { processTrackResult(shipments); })
                .catch(function() {
                    detailsDiv.innerHTML = '<div style="text-align:center;padding:30px 20px;color:#ef4444;"><i class="fas fa-wifi" style="font-size:1.5rem;"></i><p style="margin-top:8px;font-weight:600;">Unable to load tracking data. Please try again later.</p></div>';
                });
        });
}

function renderHomeNotFound(id) {
    return '<div style="text-align:center;padding:30px 20px;">' +
        '<div style="font-size:3rem;color:#94a3b8;margin-bottom:12px;"><i class="fas fa-search"></i></div>' +
        '<h3 style="color:var(--livexpress-navy);margin-bottom:8px;">Shipment Not Found</h3>' +
        '<p style="color:#64748b;">No shipment matching <strong>' + escHtml(id) + '</strong> was found in our system.</p>' +
        '<div style="text-align:left;max-width:360px;margin:16px auto 0;background:#f8fafc;padding:16px;border-radius:10px;font-size:0.9rem;color:#64748b;">' +
        '<p style="font-weight:700;color:var(--livexpress-navy);margin-bottom:8px;">Tips:</p>' +
        '<ul style="margin:0;padding-left:18px;">' +
        '<li>Check the tracking number for typos</li>' +
        '<li>New tracking numbers start with <strong>LX-</strong>. Older TW- numbers are still supported.</li>' +
        '<li>New shipments may take a few minutes to appear</li>' +
        '</ul></div></div>';
}

function renderHomeTrackingResult(s) {
    var statusColors = {
        'Processing': '#f59e0b', 'Loading': '#f59e0b', 'In Transit': '#3b82f6',
        'In Flight': '#3b82f6', 'Customs Clearance': '#8b5cf6', 'Out for Delivery': '#0ea5e9',
        'Delivered': '#22c55e', 'On Hold': '#ef4444', 'Delayed': '#ef4444', 'Cancelled': '#6b7280'
    };
    var statusIcons = {
        'Processing': 'fa-cog', 'Loading': 'fa-truck-loading', 'In Transit': 'fa-ship',
        'In Flight': 'fa-plane', 'Customs Clearance': 'fa-passport', 'Out for Delivery': 'fa-truck',
        'Delivered': 'fa-check-circle', 'On Hold': 'fa-pause-circle', 'Delayed': 'fa-exclamation-triangle', 'Cancelled': 'fa-times-circle'
    };

    var color = statusColors[s.status] || '#3b82f6';
    var icon = statusIcons[s.status] || 'fa-box';
    var progress = s.progress || 0;

    var html = '<div class="track-card">';

    // Status Header
    html += '<div class="track-status-header" style="background:linear-gradient(135deg,' + color + '22,' + color + '08);border-left:4px solid ' + color + ';">' +
        '<div class="track-status-icon" style="color:' + color + ';"><i class="fas ' + icon + '"></i></div>' +
        '<div class="track-status-info">' +
        '<div class="track-status-label" style="color:' + color + ';">' + escHtml(s.status) + '</div>' +
        '<div class="track-id">' + escHtml(s.id) + '</div>' +
        '</div></div>';

    // Progress Bar
    html += '<div class="track-progress-wrap">' +
        '<div class="track-progress-bar"><div class="track-progress-fill" style="width:' + progress + '%;background:' + color + ';"></div></div>' +
        '<div class="track-progress-pct">' + progress + '% Complete</div></div>';

    // Route
    html += '<div class="track-route">' +
        '<div class="track-route-point"><div class="track-route-dot origin"></div><div class="track-route-label">Origin</div><div class="track-route-city">' + escHtml(s.origin) + '</div></div>' +
        '<div class="track-route-line"><i class="fas fa-plane"></i></div>' +
        '<div class="track-route-point"><div class="track-route-dot dest"></div><div class="track-route-label">Destination</div><div class="track-route-city">' + escHtml(s.destination) + '</div></div>' +
        '</div>';

    // Delivery Address
    if (s.deliveryAddress) {
        html += '<div style="background:rgba(29,53,87,0.04);border-radius:10px;padding:14px 18px;margin:0 24px 18px;border-left:3px solid #1D3557;">' +
            '<div style="font-size:12px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;"><i class="fas fa-map-marker-alt" style="color:#E63946;"></i> Delivery Address</div>' +
            '<div style="font-size:14px;color:#1D3557;font-weight:500;">' + escHtml(s.deliveryAddress) + '</div></div>';
    }

    // Details Grid
    html += '<div class="track-details-grid">';
    if (s.type) html += '<div class="track-detail"><div class="track-detail-label">Service Type</div><div class="track-detail-value">' + escHtml(s.type) + '</div></div>';
    if (s.eta) html += '<div class="track-detail"><div class="track-detail-label">Estimated Arrival</div><div class="track-detail-value">' + escHtml(s.eta) + '</div></div>';
    if (s.current_location) html += '<div class="track-detail"><div class="track-detail-label">Current Location</div><div class="track-detail-value"><i class="fas fa-map-marker-alt" style="color:#E63946;"></i> ' + escHtml(s.current_location) + '</div></div>';
    if (s.weight) html += '<div class="track-detail"><div class="track-detail-label">Weight</div><div class="track-detail-value">' + escHtml(String(s.weight)) + ' kg</div></div>';
    html += '</div>';

    // Timeline (show last 3 events)
    if (s.timeline && s.timeline.length > 0) {
        var recentTimeline = s.timeline.slice(-3);
        html += '<div class="track-timeline"><h4><i class="fas fa-history"></i> Recent Updates</h4>';
        recentTimeline.forEach(function(t) {
            var completed = t.completed !== false;
            html += '<div class="track-timeline-item ' + (completed ? 'completed' : 'pending') + '">' +
                '<div class="track-timeline-dot" style="background:' + (completed ? color : '#cbd5e1') + ';"></div>' +
                '<div class="track-timeline-content">' +
                '<div class="track-timeline-time">' + escHtml(t.time || t.date || '') + '</div>' +
                '<div class="track-timeline-event">' + escHtml(t.status || t.event || '') + '</div>' +
                '<div class="track-timeline-location"><i class="fas fa-map-pin"></i> ' + escHtml(t.location || '') + '</div>' +
                '</div></div>';
        });
        html += '</div>';
    }

    html += '</div>';
    return html;
}


// ==========================================
// FORM HANDLING
// ==========================================

function autoFillForms() {
    var savedData = FormDataManager.getFormData();
    if (savedData.name) { var f = document.getElementById('contactName'); if (f) f.value = savedData.name; }
    if (savedData.email) { var f = document.getElementById('contactEmail'); if (f) f.value = savedData.email; }
    if (savedData.company) { var f = document.getElementById('contactCompany'); if (f) f.value = savedData.company; }
    if (savedData.service) { var f = document.getElementById('serviceType'); if (f) f.value = savedData.service; }
}

function showTrackingHistory() {
    var history = FormDataManager.getTrackingHistory();
    var recentSearches = document.getElementById('recentSearches');
    var recentList = document.getElementById('recentSearchesList');
    if (!recentSearches || !recentList) return;

    if (history.length === 0) { recentSearches.style.display = 'none'; return; }

    recentList.innerHTML = history.map(function(num) {
        return '<button type="button" class="btn-secondary" style="font-size:0.85rem;padding:6px 14px;" onclick="quickSearch(\'' + num + '\')">' + num + '</button>';
    }).join('');
    recentSearches.style.display = 'block';
}

function quickSearch(trackingNumber) {
    document.getElementById('trackingNumber').value = trackingNumber;
    handleTrackingSearch(new Event('submit'));
}

function clearSavedData() {
    if (confirm('Clear all saved form data?')) {
        FormDataManager.clearFormData();
        var contactForm = document.querySelector('.contact-form');
        if (contactForm) contactForm.reset();
        showAlert('Saved data cleared', 'success');
    }
}

function clearTrackingHistory() {
    if (confirm('Clear your search history?')) {
        FormDataManager.clearTrackingHistory();
        var el = document.getElementById('recentSearches');
        if (el) el.style.display = 'none';
        showAlert('Search history cleared', 'success');
    }
}

function validateForm(form) {
    var formData = new FormData(form);
    var errors = [];
    if (!formData.get('name') || formData.get('name').trim().length < 2) errors.push('Name must be at least 2 characters');
    var email = formData.get('email');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Please enter a valid email');
    if (!formData.get('company') || formData.get('company').trim().length < 2) errors.push('Company name required');
    if (!formData.get('service')) errors.push('Please select a service type');
    if (!formData.get('message') || formData.get('message').trim().length < 10) errors.push('Message must be at least 10 characters');
    return errors;
}

function handleContactForm(event) {
    event.preventDefault();
    var form = event.target;
    var errorDiv = document.getElementById('formError');
    var successDiv = document.getElementById('formSuccess');
    if (errorDiv) errorDiv.innerHTML = '';
    if (successDiv) successDiv.innerHTML = '';

    var errors = validateForm(form);
    if (errors.length > 0) {
        showError(errorDiv, errors.join('. '));
        return;
    }

    var formData = {
        name: form.querySelector('[name="name"]').value,
        email: form.querySelector('[name="email"]').value,
        company: form.querySelector('[name="company"]').value,
        service: form.querySelector('[name="service"]').value
    };
    FormDataManager.saveFormData(formData);

    var submitBtn = form.querySelector('button[type="submit"]');
    var originalHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

    setTimeout(function() {
        if (successDiv) {
            successDiv.textContent = 'Thank you! Your message has been sent. Our team will contact you within 24 hours.';
            successDiv.style.display = 'block';
        }
        form.reset();
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHTML;

        setTimeout(function() {
            if (successDiv) successDiv.style.display = 'none';
        }, 6000);
    }, 1500);
}


// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function showError(element, message) {
    if (!element) return;
    element.textContent = message;
    element.style.display = 'block';
}

function showAlert(message, type) {
    var alertDiv = document.createElement('div');
    alertDiv.style.cssText = 'position:fixed;top:24px;right:24px;z-index:99999;padding:16px 24px;border-radius:12px;font-weight:600;font-size:0.95rem;box-shadow:0 8px 30px rgba(0,0,0,0.2);animation:fadeInUp 0.3s ease-out;max-width:400px;';
    
    if (type === 'error') {
        alertDiv.style.background = '#E63946';
        alertDiv.style.color = 'white';
    } else if (type === 'success') {
        alertDiv.style.background = '#28a745';
        alertDiv.style.color = 'white';
    } else {
        alertDiv.style.background = '#1D3557';
        alertDiv.style.color = 'white';
    }
    
    alertDiv.textContent = message;
    document.body.appendChild(alertDiv);
    setTimeout(function() { alertDiv.remove(); }, 4000);
}


// ==========================================
// SMARTSUPP CHAT (replaces old custom chat)
// ==========================================


// ==========================================
// SCROLL ANIMATIONS
// ==========================================

function initScrollAnimations() {
    var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('.service-card, .wh-feature, .cert-card, .partner-card, .about-img-card, .trust-item, .video-card, .network-region, .step-card, .faq-item, .net-stat').forEach(function(el) {
        el.classList.add('fade-in');
        observer.observe(el);
    });
}


// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', function() {
    // 1. Navigation
    initNavbar();

    // 3. Auto-fill forms
    autoFillForms();
    showTrackingHistory();

    // 4. Initialize tracking map
    initTrackingMap();

    // 5. Testimonial auto-rotation
    autoRotateTestimonials();

    // 7. Counter animation (trigger when hero is visible)
    var heroObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                animateCounters();
                heroObserver.disconnect();
            }
        });
    }, { threshold: 0.3 });
    
    var heroSection = document.querySelector('.hero');
    if (heroSection) heroObserver.observe(heroSection);

    // 8. Scroll animations
    initScrollAnimations();

    // 9. Smooth scrolling
    document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            var target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // 10. Smartsupp chat (loaded via external script)

    // 11. Visitor tracking — detect country via IP, alert admin on visits/clicks
    VisitorTracker.trackPageVisit();

    // Track all external & navigation link clicks
    document.addEventListener('click', function(e) {
        var link = e.target.closest('a[href]');
        if (link) {
            var href = link.getAttribute('href') || '';
            // Track navigation clicks (not anchor-only links)
            if (href && !href.startsWith('#') && !href.startsWith('javascript')) {
                VisitorTracker.trackClick('link_click', { trackingId: href.substring(0, 100) });
            }
        }
    });

    // 13. Form auto-save on change (debounced)
    var contactForm = document.querySelector('.contact-form');
    if (contactForm) {
        var formSaveTimer = null;
        contactForm.addEventListener('change', function() {
            clearTimeout(formSaveTimer);
            formSaveTimer = setTimeout(function() {
                FormDataManager.saveFormData({
                    name: contactForm.querySelector('[name="name"]')?.value || '',
                    email: contactForm.querySelector('[name="email"]')?.value || '',
                    company: contactForm.querySelector('[name="company"]')?.value || '',
                    service: contactForm.querySelector('[name="service"]')?.value || ''
                });
            }, 500);
        });
    }

    // 14. Apply saved theme on load
    applyStoredTheme();

    // 15. (Merged into initScrollAnimations)

    // 16. Close language dropdown when clicking outside
    document.addEventListener('click', function(e) {
        var dd = document.getElementById('langDropdown');
        var sel = document.getElementById('langSelector');
        if (dd && sel && !sel.contains(e.target)) {
            dd.classList.remove('active');
        }
    });

    // 17. Live Activity Feed
    initLiveActivityFeed();
});


// ==========================================
// LIVE ACTIVITY FEED ENGINE
// ==========================================

function initLiveActivityFeed() {
    var feed = document.getElementById('activityFeed');
    if (!feed) return;

    var trackingNum = 4821;
    var maxItems = 7;

    var events = [
        { action: 'cleared customs in', dot: 'dot-blue' },
        { action: 'picked up from', dot: 'dot-green' },
        { action: 'arrived at', dot: 'dot-blue' },
        { action: 'departed', dot: 'dot-orange' },
        { action: 'in transit to', dot: 'dot-blue' },
        { action: 'loaded onto vessel at', dot: 'dot-orange' },
        { action: 'reached sorting hub in', dot: 'dot-blue' },
        { action: 'scanned at facility in', dot: 'dot-blue' },
        { action: 'processed at warehouse in', dot: 'dot-green' },
        { action: 'awaiting clearance in', dot: 'dot-orange' }
    ];

    var locations = [
        'Rotterdam, NL', 'Dubai, UAE', 'Shanghai Port', 'São Paulo, BR',
        'Narita Airport, JP', 'London, UK', 'Hamburg, DE', 'Singapore, SG',
        'Los Angeles, US', 'Busan, KR', 'Antwerp, BE', 'Mumbai, IN',
        'Hong Kong, HK', 'Sydney, AU', 'Cape Town, ZA', 'Toronto, CA',
        'Jeddah, SA', 'Istanbul, TR', 'Bangkok, TH', 'Miami, US',
        'Felixstowe, UK', 'Genoa, IT', 'Piraeus, GR', 'Barcelona, ES',
        'Vancouver, CA', 'Yokohama, JP', 'Colombo, LK', 'Durban, ZA',
        'Melbourne, AU', 'Karachi, PK', 'Lima, PE', 'Panama City, PA',
        'Oslo, NO', 'Stockholm, SE', 'Helsinki, FI', 'Warsaw, PL',
        'Lisbon, PT', 'Dublin, IE', 'Marseille, FR', 'Mombasa, KE'
    ];

    var usedCombos = new Set();

    function getUniqueEvent() {
        var combo;
        var evt, loc;
        var attempts = 0;
        do {
            evt = events[Math.floor(Math.random() * events.length)];
            loc = locations[Math.floor(Math.random() * locations.length)];
            combo = evt.action + '|' + loc;
            attempts++;
            if (attempts > 80) { usedCombos.clear(); }
        } while (usedCombos.has(combo));
        usedCombos.add(combo);
        if (usedCombos.size > 300) {
            var arr = Array.from(usedCombos);
            usedCombos = new Set(arr.slice(arr.length - 100));
        }
        return { evt: evt, loc: loc };
    }

    function createItem(secondsAgo) {
        trackingNum++;
        var padded = String(trackingNum).padStart(6, '0');
        var pick = getUniqueEvent();
        var timeText = secondsAgo < 60 ? 'just now' :
                       secondsAgo < 120 ? '1 min ago' :
                       Math.floor(secondsAgo / 60) + ' min ago';

        var item = document.createElement('div');
        item.className = 'activity-item';
        item.innerHTML =
            '<div class="activity-dot ' + pick.evt.dot + '"></div>' +
            '<div class="activity-content">' +
                '<p><strong>LX-2026-' + padded + '</strong> ' + pick.evt.action + ' <strong>' + pick.loc + '</strong></p>' +
                '<span class="activity-time">' + timeText + '</span>' +
            '</div>';
        return item;
    }

    // Seed initial items
    var seedTimes = [120, 300, 480, 720, 960, 1200, 1500];
    for (var i = 0; i < seedTimes.length; i++) {
        feed.appendChild(createItem(seedTimes[i]));
    }

    // Pause feed when tab is hidden to save CPU
    var feedPaused = false;
    var feedTimer = null;
    document.addEventListener('visibilitychange', function() {
        feedPaused = document.hidden;
        if (!feedPaused && !feedTimer) scheduleFeed();
    });

    // Add new entry every 4-9 seconds
    function addNewEntry() {
        feedTimer = null;
        if (feedPaused) return;

        var newItem = createItem(0);
        newItem.style.cssText = 'opacity:0;transform:translateX(-20px);transition:opacity 0.5s ease,transform 0.5s ease;will-change:opacity,transform;';
        feed.insertBefore(newItem, feed.firstChild);

        // Animate in
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                newItem.style.opacity = '1';
                newItem.style.transform = 'translateX(0)';
                // Clean will-change after animation
                setTimeout(function() { newItem.style.willChange = 'auto'; }, 600);
            });
        });

        // Remove oldest if over max
        while (feed.children.length > maxItems) {
            feed.removeChild(feed.lastChild);
        }

        // Age existing timestamps
        var items = feed.querySelectorAll('.activity-time');
        for (var j = 0; j < items.length; j++) {
            var txt = items[j].textContent;
            if (txt === 'just now') { items[j].textContent = '1 min ago'; }
            else {
                var m = txt.match(/(\d+)\s*min/);
                if (m) { items[j].textContent = (parseInt(m[1]) + 1) + ' min ago'; }
            }
        }

        scheduleFeed();
    }

    function scheduleFeed() {
        if (feedTimer) return;
        var next = 4000 + Math.floor(Math.random() * 5000);
        feedTimer = setTimeout(addNewEntry, next);
    }

    // Start after first delay
    scheduleFeed();
}


// ==========================================
// DARK / LIGHT MODE TOGGLE
// ==========================================

function toggleTheme() {
    var html = document.documentElement;
    var icon = document.getElementById('themeIcon');
    if (html.getAttribute('data-theme') === 'dark') {
        html.removeAttribute('data-theme');
        if (icon) { icon.className = 'fas fa-moon'; }
        localStorage.setItem('livexpressTheme', 'light');
    } else {
        html.setAttribute('data-theme', 'dark');
        if (icon) { icon.className = 'fas fa-sun'; }
        localStorage.setItem('livexpressTheme', 'dark');
    }
}

function applyStoredTheme() {
    var saved = localStorage.getItem('livexpressTheme');
    var icon = document.getElementById('themeIcon');
    if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (icon) icon.className = 'fas fa-sun';
    }
}


// ==========================================
// LANGUAGE SELECTOR (Google Translate)
// ==========================================

function toggleLangMenu() {
    var dd = document.getElementById('langDropdown');
    if (dd) dd.classList.toggle('active');
}

function switchLang(langCode, label) {
    // Update button label
    var el = document.getElementById('currentLang');
    if (el) el.textContent = label;

    // Close dropdown
    var dd = document.getElementById('langDropdown');
    if (dd) dd.classList.remove('active');

    // Trigger Google Translate
    triggerGoogleTranslate(langCode);
}

function triggerGoogleTranslate(lang) {
    // Set the Google Translate cookie
    var domain = location.hostname;
    if (lang === 'en') {
        // Reset to original
        document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=' + domain;
        document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
        // Use the API to reset without reloading
        var frame = document.querySelector('.goog-te-combo');
        if (frame) {
            frame.value = 'en';
            frame.dispatchEvent(new Event('change'));
        }
        return;
    }
    document.cookie = 'googtrans=/en/' + lang + '; path=/; domain=' + domain;
    document.cookie = 'googtrans=/en/' + lang + '; path=/';

    // Use the translate combo API (no page reload)
    var frame = document.querySelector('.goog-te-combo');
    if (frame) {
        frame.value = lang;
        frame.dispatchEvent(new Event('change'));
    }
}

// Callback for Google Translate script
function googleTranslateInit() {
    new google.translate.TranslateElement({
        pageLanguage: 'en',
        autoDisplay: false,
        layout: google.translate.TranslateElement.InlineLayout.SIMPLE
    }, 'google_translate_element');
}

// Hide Google Translate top bar after it loads
(function hideGoogleTranslateBar() {
    var style = document.createElement('style');
    style.textContent = '.goog-te-banner-frame, .skiptranslate { display: none !important; } body { top: 0 !important; }';
    document.head.appendChild(style);
})();
