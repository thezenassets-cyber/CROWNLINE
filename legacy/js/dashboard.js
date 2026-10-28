document.addEventListener('DOMContentLoaded', function() {
    var statusChart = null;
    var historyChart = null;

    // Color map for status badges & charts
    var statusColors = {
        'In Transit': '#1D3557',
        'In Flight': '#2563eb',
        'Delivered': '#22c55e',
        'Processing': '#E8C84A',
        'Loading': '#f59e0b',
        'Out for Delivery': '#06b6d4',
        'Pending': '#9ca3af',
        'Cancelled': '#ef4444'
    };

    function fmt(n) {
        return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function loadDashboard() {
        fetch(siteApi('/api/dashboard/stats'))
            .then(function(r) { return r.json(); })
            .then(function(data) {
                // KPIs
                document.getElementById('activeShipments').textContent = fmt(data.active || 0);
                document.getElementById('deliveryVehicles').textContent = fmt(data.inTransit || 0);
                document.getElementById('portsServed').textContent = fmt(data.total || 0);
                document.getElementById('packagesDelivered').textContent = fmt(data.delivered || 0);

                // Status doughnut chart
                var labels = Object.keys(data.statusCounts || {});
                var values = labels.map(function(l) { return data.statusCounts[l]; });
                var colors = labels.map(function(l) { return statusColors[l] || '#6c757d'; });

                var statusCtx = document.getElementById('statusChart').getContext('2d');
                if (statusChart) statusChart.destroy();
                statusChart = new Chart(statusCtx, {
                    type: 'doughnut',
                    data: {
                        labels: labels,
                        datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }]
                    },
                    options: {
                        responsive: true,
                        plugins: { legend: { position: 'bottom', labels: { padding: 16, font: { size: 13 } } } }
                    }
                });

                // Recent shipments bar chart (progress)
                var recent = (data.recent || []).slice(0, 8);
                var rLabels = recent.map(function(s) { return s.id.replace(/^(?:LX|TW)-/, ''); });
                var rData = recent.map(function(s) { return s.progress || 0; });
                var rColors = recent.map(function(s) { return statusColors[s.status] || '#6c757d'; });

                var monthlyCtx = document.getElementById('monthlyChart').getContext('2d');
                if (historyChart) historyChart.destroy();
                historyChart = new Chart(monthlyCtx, {
                    type: 'bar',
                    data: {
                        labels: rLabels,
                        datasets: [{
                            label: 'Progress %',
                            data: rData,
                            backgroundColor: rColors,
                            borderRadius: 6,
                            maxBarThickness: 40
                        }]
                    },
                    options: {
                        responsive: true,
                        scales: { y: { beginAtZero: true, max: 100, ticks: { callback: function(v) { return v + '%'; } } } },
                        plugins: { legend: { display: false } }
                    }
                });

                // Build recent shipments table
                buildRecentTable(recent);
            })
            .catch(function() {
                document.getElementById('activeShipments').textContent = '—';
                document.getElementById('deliveryVehicles').textContent = '—';
                document.getElementById('portsServed').textContent = '—';
                document.getElementById('packagesDelivered').textContent = '—';
            });
    }

    function buildRecentTable(shipments) {
        var container = document.getElementById('recentShipments');
        if (!container) return;
        if (!shipments.length) {
            container.innerHTML = '<p style="color:rgba(255,255,255,0.5);text-align:center;padding:24px;">No shipments yet.</p>';
            return;
        }
        var html = '<table style="width:100%;border-collapse:collapse;font-size:0.9rem;">' +
            '<thead><tr style="border-bottom:2px solid rgba(255,255,255,0.1);">' +
            '<th style="text-align:left;padding:10px 8px;color:#E8C84A;">Tracking ID</th>' +
            '<th style="text-align:left;padding:10px 8px;color:#E8C84A;">Route</th>' +
            '<th style="text-align:left;padding:10px 8px;color:#E8C84A;">Status</th>' +
            '<th style="text-align:left;padding:10px 8px;color:#E8C84A;">Progress</th>' +
            '<th style="text-align:left;padding:10px 8px;color:#E8C84A;">ETA</th>' +
            '</tr></thead><tbody>';
        shipments.forEach(function(s) {
            var color = statusColors[s.status] || '#6c757d';
            html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.06);">' +
                '<td style="padding:10px 8px;font-family:monospace;font-weight:700;"><a href="tracking.html?id=' + encodeURIComponent(s.id) + '" style="color:#E8C84A;text-decoration:none;">' + s.id + '</a></td>' +
                '<td style="padding:10px 8px;">' + (s.origin || '') + ' → ' + (s.destination || '') + '</td>' +
                '<td style="padding:10px 8px;"><span style="background:' + color + ';color:#fff;padding:3px 10px;border-radius:20px;font-size:0.8rem;font-weight:600;">' + s.status + '</span></td>' +
                '<td style="padding:10px 8px;">' +
                    '<div style="background:rgba(255,255,255,0.1);border-radius:10px;height:8px;width:100px;overflow:hidden;">' +
                    '<div style="background:' + color + ';height:100%;width:' + (s.progress || 0) + '%;border-radius:10px;"></div></div>' +
                    '<span style="font-size:0.75rem;color:rgba(255,255,255,0.5);margin-left:6px;">' + (s.progress || 0) + '%</span>' +
                '</td>' +
                '<td style="padding:10px 8px;font-size:0.85rem;">' + (s.eta || '—') + '</td>' +
                '</tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    }

    loadDashboard();
    // Auto-refresh every 30 seconds
    setInterval(loadDashboard, 30000);

});