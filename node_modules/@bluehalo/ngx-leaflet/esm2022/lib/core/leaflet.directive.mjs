import { Directive, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { latLng, map } from 'leaflet';
import { LeafletUtil } from './leaflet.util';
import * as i0 from "@angular/core";
export class LeafletDirective {
    constructor(element, zone) {
        this.element = element;
        this.zone = zone;
        this.DEFAULT_ZOOM = 1;
        this.DEFAULT_CENTER = latLng(38.907192, -77.036871);
        this.DEFAULT_FPZ_OPTIONS = {};
        this.fitBoundsOptions = this.DEFAULT_FPZ_OPTIONS;
        this.panOptions = this.DEFAULT_FPZ_OPTIONS;
        this.zoomOptions = this.DEFAULT_FPZ_OPTIONS;
        this.zoomPanOptions = this.DEFAULT_FPZ_OPTIONS;
        // Default configuration
        this.options = {};
        // Configure callback function for the map
        this.mapReady = new EventEmitter();
        this.zoomChange = new EventEmitter();
        this.centerChange = new EventEmitter();
        // Mouse Map Events
        this.onClick = new EventEmitter();
        this.onDoubleClick = new EventEmitter();
        this.onMouseDown = new EventEmitter();
        this.onMouseUp = new EventEmitter();
        this.onMouseMove = new EventEmitter();
        this.onMouseOver = new EventEmitter();
        this.onMouseOut = new EventEmitter();
        // Map Move Events
        this.onMapMove = new EventEmitter();
        this.onMapMoveStart = new EventEmitter();
        this.onMapMoveEnd = new EventEmitter();
        // Map Zoom Events
        this.onMapZoom = new EventEmitter();
        this.onMapZoomStart = new EventEmitter();
        this.onMapZoomEnd = new EventEmitter();
        // Nothing here
    }
    ngOnInit() {
        // Create the map outside of angular so the various map events don't trigger change detection
        this.zone.runOutsideAngular(() => {
            // Create the map with some reasonable defaults
            this.map = map(this.element.nativeElement, this.options);
            this.addMapEventListeners();
        });
        // Only setView if there is a center/zoom
        if (null != this.center && null != this.zoom) {
            this.setView(this.center, this.zoom);
        }
        // Set up all the initial settings
        if (null != this.fitBounds) {
            this.setFitBounds(this.fitBounds);
        }
        if (null != this.maxBounds) {
            this.setMaxBounds(this.maxBounds);
        }
        if (null != this.minZoom) {
            this.setMinZoom(this.minZoom);
        }
        if (null != this.maxZoom) {
            this.setMaxZoom(this.maxZoom);
        }
        this.doResize();
        // Fire map ready event
        this.mapReady.emit(this.map);
    }
    ngOnChanges(changes) {
        /*
         * The following code is to address an issue with our (basic) implementation of
         * zooming and panning. From our testing, it seems that a pan operation followed
         * by a zoom operation in the same thread will interfere with eachother. The zoom
         * operation interrupts/cancels the pan, resulting in a final center point that is
         * inaccurate. The solution seems to be to either separate them with a timeout or
          * to collapse them into a setView call.
         */
        // Zooming and Panning
        if (changes['zoom'] && changes['center'] && null != this.zoom && null != this.center) {
            this.setView(changes['center'].currentValue, changes['zoom'].currentValue);
        }
        // Set the zoom level
        else if (changes['zoom']) {
            this.setZoom(changes['zoom'].currentValue);
        }
        // Set the map center
        else if (changes['center']) {
            this.setCenter(changes['center'].currentValue);
        }
        // Other options
        if (changes['fitBounds']) {
            this.setFitBounds(changes['fitBounds'].currentValue);
        }
        if (changes['maxBounds']) {
            this.setMaxBounds(changes['maxBounds'].currentValue);
        }
        if (changes['minZoom']) {
            this.setMinZoom(changes['minZoom'].currentValue);
        }
        if (changes['maxZoom']) {
            this.setMaxZoom(changes['maxZoom'].currentValue);
        }
    }
    ngOnDestroy() {
        // If this directive is destroyed, the map is too
        if (null != this.map) {
            this.map.remove();
        }
    }
    getMap() {
        return this.map;
    }
    onResize() {
        this.delayResize();
    }
    addMapEventListeners() {
        const registerEventHandler = (eventName, handler) => {
            this.map.on(eventName, handler);
        };
        // Add all the pass-through mouse event handlers
        registerEventHandler('click', (e) => LeafletUtil.handleEvent(this.zone, this.onClick, e));
        registerEventHandler('dblclick', (e) => LeafletUtil.handleEvent(this.zone, this.onDoubleClick, e));
        registerEventHandler('mousedown', (e) => LeafletUtil.handleEvent(this.zone, this.onMouseDown, e));
        registerEventHandler('mouseup', (e) => LeafletUtil.handleEvent(this.zone, this.onMouseUp, e));
        registerEventHandler('mouseover', (e) => LeafletUtil.handleEvent(this.zone, this.onMouseOver, e));
        registerEventHandler('mouseout', (e) => LeafletUtil.handleEvent(this.zone, this.onMouseOut, e));
        registerEventHandler('mousemove', (e) => LeafletUtil.handleEvent(this.zone, this.onMouseMove, e));
        registerEventHandler('zoomstart', (e) => LeafletUtil.handleEvent(this.zone, this.onMapZoomStart, e));
        registerEventHandler('zoom', (e) => LeafletUtil.handleEvent(this.zone, this.onMapZoom, e));
        registerEventHandler('zoomend', (e) => LeafletUtil.handleEvent(this.zone, this.onMapZoomEnd, e));
        registerEventHandler('movestart', (e) => LeafletUtil.handleEvent(this.zone, this.onMapMoveStart, e));
        registerEventHandler('move', (e) => LeafletUtil.handleEvent(this.zone, this.onMapMove, e));
        registerEventHandler('moveend', (e) => LeafletUtil.handleEvent(this.zone, this.onMapMoveEnd, e));
        // Update any things for which we provide output bindings
        const outputUpdateHandler = () => {
            const zoom = this.map.getZoom();
            if (zoom !== this.zoom) {
                this.zoom = zoom;
                LeafletUtil.handleEvent(this.zone, this.zoomChange, zoom);
            }
            const center = this.map.getCenter();
            if (null != center || null != this.center) {
                if (((null == center || null == this.center) && center !== this.center)
                    || (center.lat !== this.center.lat || center.lng !== this.center.lng)) {
                    this.center = center;
                    LeafletUtil.handleEvent(this.zone, this.centerChange, center);
                }
            }
        };
        registerEventHandler('moveend', outputUpdateHandler);
        registerEventHandler('zoomend', outputUpdateHandler);
    }
    /**
     * Resize the map to fit it's parent container
     */
    doResize() {
        // Run this outside of angular so the map events stay outside of angular
        this.zone.runOutsideAngular(() => {
            // Invalidate the map size to trigger it to update itself
            if (null != this.map) {
                this.map.invalidateSize({});
            }
        });
    }
    /**
     * Manage a delayed resize of the component
     */
    delayResize() {
        if (null != this.resizeTimer) {
            clearTimeout(this.resizeTimer);
        }
        this.resizeTimer = setTimeout(this.doResize.bind(this), 200);
    }
    /**
     * Set the view (center/zoom) all at once
     * @param center The new center
     * @param zoom The new zoom level
     */
    setView(center, zoom) {
        if (null != this.map && null != center && null != zoom) {
            this.map.setView(center, zoom, this.zoomPanOptions);
        }
    }
    /**
     * Set the map zoom level
     * @param zoom the new zoom level for the map
     */
    setZoom(zoom) {
        if (null != this.map && null != zoom) {
            this.map.setZoom(zoom, this.zoomOptions);
        }
    }
    /**
     * Set the center of the map
     * @param center the center point
     */
    setCenter(center) {
        if (null != this.map && null != center) {
            this.map.panTo(center, this.panOptions);
        }
    }
    /**
     * Fit the map to the bounds
     * @param latLngBounds the boundary to set
     */
    setFitBounds(latLngBounds) {
        if (null != this.map && null != latLngBounds) {
            this.map.fitBounds(latLngBounds, this.fitBoundsOptions);
        }
    }
    /**
     * Set the map's max bounds
     * @param latLngBounds the boundary to set
     */
    setMaxBounds(latLngBounds) {
        if (null != this.map && null != latLngBounds) {
            this.map.setMaxBounds(latLngBounds);
        }
    }
    /**
     * Set the map's min zoom
     * @param number the new min zoom
     */
    setMinZoom(zoom) {
        if (null != this.map && null != zoom) {
            this.map.setMinZoom(zoom);
        }
    }
    /**
     * Set the map's min zoom
     * @param number the new min zoom
     */
    setMaxZoom(zoom) {
        if (null != this.map && null != zoom) {
            this.map.setMaxZoom(zoom);
        }
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "18.0.1", ngImport: i0, type: LeafletDirective, deps: [{ token: i0.ElementRef }, { token: i0.NgZone }], target: i0.ɵɵFactoryTarget.Directive }); }
    static { this.ɵdir = i0.ɵɵngDeclareDirective({ minVersion: "14.0.0", version: "18.0.1", type: LeafletDirective, selector: "[leaflet]", inputs: { fitBoundsOptions: ["leafletFitBoundsOptions", "fitBoundsOptions"], panOptions: ["leafletPanOptions", "panOptions"], zoomOptions: ["leafletZoomOptions", "zoomOptions"], zoomPanOptions: ["leafletZoomPanOptions", "zoomPanOptions"], options: ["leafletOptions", "options"], zoom: ["leafletZoom", "zoom"], center: ["leafletCenter", "center"], fitBounds: ["leafletFitBounds", "fitBounds"], maxBounds: ["leafletMaxBounds", "maxBounds"], minZoom: ["leafletMinZoom", "minZoom"], maxZoom: ["leafletMaxZoom", "maxZoom"] }, outputs: { mapReady: "leafletMapReady", zoomChange: "leafletZoomChange", centerChange: "leafletCenterChange", onClick: "leafletClick", onDoubleClick: "leafletDoubleClick", onMouseDown: "leafletMouseDown", onMouseUp: "leafletMouseUp", onMouseMove: "leafletMouseMove", onMouseOver: "leafletMouseOver", onMouseOut: "leafletMouseOut", onMapMove: "leafletMapMove", onMapMoveStart: "leafletMapMoveStart", onMapMoveEnd: "leafletMapMoveEnd", onMapZoom: "leafletMapZoom", onMapZoomStart: "leafletMapZoomStart", onMapZoomEnd: "leafletMapZoomEnd" }, host: { listeners: { "window:resize": "onResize()" } }, usesOnChanges: true, ngImport: i0 }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "18.0.1", ngImport: i0, type: LeafletDirective, decorators: [{
            type: Directive,
            args: [{
                    selector: '[leaflet]'
                }]
        }], ctorParameters: () => [{ type: i0.ElementRef }, { type: i0.NgZone }], propDecorators: { fitBoundsOptions: [{
                type: Input,
                args: ['leafletFitBoundsOptions']
            }], panOptions: [{
                type: Input,
                args: ['leafletPanOptions']
            }], zoomOptions: [{
                type: Input,
                args: ['leafletZoomOptions']
            }], zoomPanOptions: [{
                type: Input,
                args: ['leafletZoomPanOptions']
            }], options: [{
                type: Input,
                args: ['leafletOptions']
            }], mapReady: [{
                type: Output,
                args: ['leafletMapReady']
            }], zoom: [{
                type: Input,
                args: ['leafletZoom']
            }], zoomChange: [{
                type: Output,
                args: ['leafletZoomChange']
            }], center: [{
                type: Input,
                args: ['leafletCenter']
            }], centerChange: [{
                type: Output,
                args: ['leafletCenterChange']
            }], fitBounds: [{
                type: Input,
                args: ['leafletFitBounds']
            }], maxBounds: [{
                type: Input,
                args: ['leafletMaxBounds']
            }], minZoom: [{
                type: Input,
                args: ['leafletMinZoom']
            }], maxZoom: [{
                type: Input,
                args: ['leafletMaxZoom']
            }], onClick: [{
                type: Output,
                args: ['leafletClick']
            }], onDoubleClick: [{
                type: Output,
                args: ['leafletDoubleClick']
            }], onMouseDown: [{
                type: Output,
                args: ['leafletMouseDown']
            }], onMouseUp: [{
                type: Output,
                args: ['leafletMouseUp']
            }], onMouseMove: [{
                type: Output,
                args: ['leafletMouseMove']
            }], onMouseOver: [{
                type: Output,
                args: ['leafletMouseOver']
            }], onMouseOut: [{
                type: Output,
                args: ['leafletMouseOut']
            }], onMapMove: [{
                type: Output,
                args: ['leafletMapMove']
            }], onMapMoveStart: [{
                type: Output,
                args: ['leafletMapMoveStart']
            }], onMapMoveEnd: [{
                type: Output,
                args: ['leafletMapMoveEnd']
            }], onMapZoom: [{
                type: Output,
                args: ['leafletMapZoom']
            }], onMapZoomStart: [{
                type: Output,
                args: ['leafletMapZoomStart']
            }], onMapZoomEnd: [{
                type: Output,
                args: ['leafletMapZoomEnd']
            }], onResize: [{
                type: HostListener,
                args: ['window:resize', []]
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGVhZmxldC5kaXJlY3RpdmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9wcm9qZWN0cy9uZ3gtbGVhZmxldC9zcmMvbGliL2NvcmUvbGVhZmxldC5kaXJlY3RpdmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUNOLFNBQVMsRUFBYyxZQUFZLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBd0MsTUFBTSxFQUV0RyxNQUFNLGVBQWUsQ0FBQztBQUV2QixPQUFPLEVBQUUsTUFBTSxFQUF5RCxHQUFHLEVBQW1CLE1BQU0sU0FBUyxDQUFDO0FBRTlHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQzs7QUFLN0MsTUFBTSxPQUFPLGdCQUFnQjtJQWdFNUIsWUFBb0IsT0FBbUIsRUFBVSxJQUFZO1FBQXpDLFlBQU8sR0FBUCxPQUFPLENBQVk7UUFBVSxTQUFJLEdBQUosSUFBSSxDQUFRO1FBN0RwRCxpQkFBWSxHQUFHLENBQUMsQ0FBQztRQUNqQixtQkFBYyxHQUFHLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUMvQyx3QkFBbUIsR0FBRyxFQUFFLENBQUM7UUFPQSxxQkFBZ0IsR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUM7UUFDbEQsZUFBVSxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQztRQUNyQyxnQkFBVyxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQztRQUNwQyxtQkFBYyxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQztRQUcxRSx3QkFBd0I7UUFDQyxZQUFPLEdBQWUsRUFBRSxDQUFDO1FBRWxELDBDQUEwQztRQUNmLGFBQVEsR0FBRyxJQUFJLFlBQVksRUFBTyxDQUFDO1FBSWpDLGVBQVUsR0FBRyxJQUFJLFlBQVksRUFBVSxDQUFDO1FBSXRDLGlCQUFZLEdBQUcsSUFBSSxZQUFZLEVBQVUsQ0FBQztRQWV6RSxtQkFBbUI7UUFDSyxZQUFPLEdB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QjtnQkFDQyxVQUFVO3NCQUFwQyxNQUFNO3VCQUFDLGlCQUFpQjtnQkFHQyxTQUFTO3NCQUFsQyxNQUFNO3VCQUFDLGdCQUFnQjtnQkFDTyxjQUFjO3NCQUE1QyxNQUFNO3VCQUFDLHFCQUFxQjtnQkFDQSxZQUFZO3NCQUF4QyxNQUFNO3VCQUFDLG1CQUFtQjtnQkFHRCxTQUFTO3NCQUFsQyxNQUFNO3VCQUFDLGdCQUFnQjtnQkFDTyxjQUFjO3NCQUE1QyxNQUFNO3VCQUFDLHFCQUFxQjtnQkFDQSxZQUFZO3NCQUF4QyxNQUFNO3VCQUFDLG1CQUFtQjtnQkFzRzNCLFFBQVE7c0JBRFAsWUFBWTt1QkFBQyxlQUFlLEVBQUUsRUFBRSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG5cdERpcmVjdGl2ZSwgRWxlbWVudFJlZiwgRXZlbnRFbWl0dGVyLCBIb3N0TGlzdGVuZXIsIElucHV0LCBOZ1pvbmUsIE9uQ2hhbmdlcywgT25EZXN0cm95LCBPbkluaXQsIE91dHB1dCxcblx0U2ltcGxlQ2hhbmdlXG59IGZyb20gJ0Bhbmd1bGFyL2NvcmUnO1xuXG5pbXBvcnQgeyBsYXRMbmcsIExhdExuZywgTGF0TG5nQm91bmRzLCBMZWFmbGV0RXZlbnQsIExlYWZsZXRNb3VzZUV2ZW50LCBtYXAsIE1hcCwgTWFwT3B0aW9ucyB9IGZyb20gJ2xlYWZsZXQnO1xuXG5pbXBvcnQgeyBMZWFmbGV0VXRpbCB9IGZyb20gJy4vbGVhZmxldC51dGlsJztcblxuQERpcmVjdGl2ZSh7XG5cdHNlbGVjdG9yOiAnW2xlYWZsZXRdJ1xufSlcbmV4cG9ydCBjbGFzcyBMZWFmbGV0RGlyZWN0aXZlXG5cdGltcGxlbWVudHMgT25DaGFuZ2VzLCBPbkRlc3Ryb3ksIE9uSW5pdCB7XG5cblx0cmVhZG9ubHkgREVGQVVMVF9aT09NID0gMTtcblx0cmVhZG9ubHkgREVGQVVMVF9DRU5URVIgPSBsYXRMbmcoMzguOTA3MTkyLCAtNzcuMDM2ODcxKTtcblx0cmVhZG9ubHkgREVGQVVMVF9GUFpfT1BUSU9OUyA9IHt9O1xuXG5cdHJlc2l6ZVRpbWVyOiBhbnk7XG5cblx0Ly8gUmVmZXJlbmNlIHRvIHRoZSBwcmltYXJ5IG1hcCBvYmplY3Rcblx0bWFwOiBNYXA7XG5cblx0QElucHV0KCdsZWFmbGV0Rml0Qm91bmRzT3B0aW9ucycpIGZpdEJvdW5kc09wdGlvbnMgPSB0aGlzLkRFRkFVTFRfRlBaX09QVElPTlM7XG5cdEBJbnB1dCgnbGVhZmxldFBhbk9wdGlvbnMnKSBwYW5PcHRpb25zID0gdGhpcy5ERUZBVUxUX0ZQWl9PUFRJT05TO1xuXHRASW5wdXQoJ2xlYWZsZXRab29tT3B0aW9ucycpIHpvb21PcHRpb25zID0gdGhpcy5ERUZBVUxUX0ZQWl9PUFRJT05TO1xuXHRASW5wdXQoJ2xlYWZsZXRab29tUGFuT3B0aW9ucycpIHpvb21QYW5PcHRpb25zID0gdGhpcy5ERUZBVUxUX0ZQWl9PUFRJT05TO1xuXG5cblx0Ly8gRGVmYXVsdCBjb25maWd1cmF0aW9uXG5cdEBJbnB1dCgnbGVhZmxldE9wdGlvbnMnKSBvcHRpb25zOiBNYXBPcHRpb25zID0ge307XG5cblx0Ly8gQ29uZmlndXJlIGNhbGxiYWNrIGZ1bmN0aW9uIGZvciB0aGUgbWFwXG5cdEBPdXRwdXQoJ2xlYWZsZXRNYXBSZWFkeScpIG1hcFJlYWR5ID0gbmV3IEV2ZW50RW1pdHRlcjxNYXA+KCk7XG5cblx0Ly8gWm9vbSBsZXZlbCBmb3IgdGhlIG1hcFxuXHRASW5wdXQoJ2xlYWZsZXRab29tJykgem9vbTogbnVtYmVyO1xuXHRAT3V0cHV0KCdsZWFmbGV0Wm9vbUNoYW5nZScpIHpvb21DaGFuZ2UgPSBuZXcgRXZlbnRFbWl0dGVyPG51bWJlcj4oKTtcblxuXHQvLyBDZW50ZXIgb2YgdGhlIG1hcFxuXHRASW5wdXQoJ2xlYWZsZXRDZW50ZXInKSBjZW50ZXI6IExhdExuZztcblx0QE91dHB1dCgnbGVhZmxldENlbnRlckNoYW5nZScpIGNlbnRlckNoYW5nZSA9IG5ldyBFdmVudEVtaXR0ZXI8TGF0TG5nPigpO1xuXG5cdC8vIFNldCBmaXQgYm91bmRzIGZvciBtYXBcblx0QElucHV0KCdsZWFmbGV0Rml0Qm91bmRzJykgZml0Qm91bmRzOiBMYXRMbmdCb3VuZHM7XG5cblx0Ly8gU2V0IHRoZSBtYXggYm91bmRzIGZvciB0aGUgbWFwXG5cdEBJbnB1dCgnbGVhZmxldE1heEJvdW5kcycpIG1heEJvdW5kczogTGF0TG5nQm91bmRzO1xuXG5cdC8vIFNldCB0aGUgbWluIHpvb20gZm9yIHRoZSBtYXBcblx0QElucHV0KCdsZWFmbGV0TWluWm9vbScpIG1pblpvb206IG51bWJlcjtcblxuXHQvLyBTZXQgdGhlIG1heCB6b29tIGZvciB0aGUgbWFwXG5cdEBJbnB1dCgnbGVhZmxldE1heFpvb20nKSBtYXhab29tOiBudW1iZXI7XG5cblxuXHQvLyBNb3VzZSBNYXAgRXZlbnRzXG5cdEBPdXRwdXQoJ2xlYWZsZXRDbGljaycpIG9uQ2xpY2sgPSBuZXcgRXZlbnRFbWl0dGVyPExlYWZsZXRNb3VzZUV2ZW50PigpO1xuXHRAT3V0cHV0KCdsZWFmbGV0RG91YmxlQ2xpY2snKSBvbkRvdWJsZUNsaWNrID0gbmV3IEV2ZW50RW1pdHRlcjxMZWFmbGV0TW91c2VFdmVudD4oKTtcblx0QE91dHB1dCgnbGVhZmxldE1vdXNlRG93bicpIG9uTW91c2VEb3duID0gbmV3IEV2ZW50RW1pdHRlcjxMZWFmbGV0TW91c2VFdmVudD4oKTtcblx0QE91dHB1dCgnbGVhZmxldE1vdXNlVXAnKSBvbk1vdXNlVXAgPSBuZXcgRXZlbnRFbWl0dGVyPExlYWZsZXRNb3VzZUV2ZW50PigpO1xuXHRAT3V0cHV0KCdsZWFmbGV0TW91c2VNb3ZlJykgb25Nb3VzZU1vdmUgPSBuZXcgRXZlbnRFbWl0dGVyPExlYWZsZXRNb3VzZUV2ZW50PigpO1xuXHRAT3V0cHV0KCdsZWFmbGV0TW91c2VPdmVyJykgb25Nb3VzZU92ZXIgPSBuZXcgRXZlbnRFbWl0dGVyPExlYWZsZXRNb3VzZUV2ZW50PigpO1xuXHRAT3V0cHV0KCdsZWFmbGV0TW91c2VPdXQnKSBvbk1vdXNlT3V0ID0gbmV3IEV2ZW50RW1pdHRlcjxMZWFmbGV0TW91c2VFdmVudD4oKTtcblxuXHQvLyBNYXAgTW92ZSBFdmVudHNcblx0QE91dHB1dCgnbGVhZmxldE1hcE1vdmUnKSBvbk1hcE1vdmUgPSBuZXcgRXZlbnRFbWl0dGVyPExlYWZsZXRFdmVudD4oKTtcblx0QE91dHB1dCgnbGVhZmxldE1hcE1vdmVTdGFydCcpIG9uTWFwTW92ZVN0YXJ0ID0gbmV3IEV2ZW50RW1pdHRlcjxMZWFmbGV0RXZlbnQ+KCk7XG5cdEBPdXRwdXQoJ2xlYWZsZXRNYXBNb3ZlRW5kJykgb25NYXBNb3ZlRW5kID0gbmV3IEV2ZW50RW1pdHRlcjxMZWFmbGV0RXZlbnQ+KCk7XG5cblx0Ly8gTWFwIFpvb20gRXZlbnRzXG5cdEBPdXRwdXQoJ2xlYWZsZXRNYXBab29tJykgb25NYXBab29tID0gbmV3IEV2ZW50RW1pdHRlcjxMZWFmbGV0RXZlbnQ+KCk7XG5cdEBPdXRwdXQoJ2xlYWZsZXRNYXBab29tU3RhcnQnKSBvbk1hcFpvb21TdGFydCA9IG5ldyBFdmVudEVtaXR0ZXI8TGVhZmxldEV2ZW50PigpO1xuXHRAT3V0cHV0KCdsZWFmbGV0TWFwWm9vbUVuZCcpIG9uTWFwWm9vbUVuZCA9IG5ldyBFdmVudEVtaXR0ZXI8TGVhZmxldEV2ZW50PigpO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgZWxlbWVudDogRWxlbWVudFJlZiwgcHJpdmF0ZSB6b25lOiBOZ1pvbmUpIHtcblx0XHQvLyBOb3RoaW5nIGhlcmVcblx0fVxuXG5cdG5nT25Jbml0KCkge1xuXG5cdFx0Ly8gQ3JlYXRlIHRoZSBtYXAgb3V0c2lkZSBvZiBhbmd1bGFyIHNvIHRoZSB2YXJpb3VzIG1hcCBldmVudHMgZG9uJ3QgdHJpZ2dlciBjaGFuZ2UgZGV0ZWN0aW9uXG5cdFx0dGhpcy56b25lLnJ1bk91dHNpZGVBbmd1bGFyKCgpID0+IHtcblxuXHRcdFx0Ly8gQ3JlYXRlIHRoZSBtYXAgd2l0aCBzb21lIHJlYXNvbmFibGUgZGVmYXVsdHNcblx0XHRcdHRoaXMubWFwID0gbWFwKHRoaXMuZWxlbWVudC5uYXRpdmVFbGVtZW50LCB0aGlzLm9wdGlvbnMpO1xuXHRcdFx0dGhpcy5hZGRNYXBFdmVudExpc3RlbmVycygpO1xuXG5cdFx0fSk7XG5cblx0XHQvLyBPbmx5IHNldFZpZXcgaWYgdGhlcmUgaXMgYSBjZW50ZXIvem9vbVxuXHRcdGlmIChudWxsICE9IHRoaXMuY2VudGVyICYmIG51bGwgIT0gdGhpcy56b29tKSB7XG5cdFx0XHR0aGlzLnNldFZpZXcodGhpcy5jZW50ZXIsIHRoaXMuem9vbSk7XG5cdFx0fVxuXG5cdFx0Ly8gU2V0IHVwIGFsbCB0aGUgaW5pdGlhbCBzZXR0aW5nc1xuXHRcdGlmIChudWxsICE9IHRoaXMuZml0Qm91bmRzKSB7XG5cdFx0XHR0aGlzLnNldEZpdEJvdW5kcyh0aGlzLmZpdEJvdW5kcyk7XG5cdFx0fVxuXG5cdFx0aWYgKG51bGwgIT0gdGhpcy5tYXhCb3VuZHMpIHtcblx0XHRcdHRoaXMuc2V0TWF4Qm91bmRzKHRoaXMubWF4Qm91bmRzKTtcblx0XHR9XG5cblx0XHRpZiAobnVsbCAhPSB0aGlzLm1pblpvb20pIHtcblx0XHRcdHRoaXMuc2V0TWluWm9vbSh0aGlzLm1pblpvb20pO1xuXHRcdH1cblxuXHRcdGlmIChudWxsICE9IHRoaXMubWF4Wm9vbSkge1xuXHRcdFx0dGhpcy5zZXRNYXhab29tKHRoaXMubWF4Wm9vbSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kb1Jlc2l6ZSgpO1xuXG5cdFx0Ly8gRmlyZSBtYXAgcmVhZHkgZXZlbnRcblx0XHR0aGlzLm1hcFJlYWR5LmVtaXQodGhpcy5tYXApO1xuXG5cdH1cblxuXHRuZ09uQ2hhbmdlcyhjaGFuZ2VzOiB7IFtrZXk6IHN0cmluZ106IFNpbXBsZUNoYW5nZSB9KSB7XG5cblx0XHQvKlxuXHRcdCAqIFRoZSBmb2xsb3dpbmcgY29kZSBpcyB0byBhZGRyZXNzIGFuIGlzc3VlIHdpdGggb3VyIChiYXNpYykgaW1wbGVtZW50YXRpb24gb2Zcblx0XHQgKiB6b29taW5nIGFuZCBwYW5uaW5nLiBGcm9tIG91ciB0ZXN0aW5nLCBpdCBzZWVtcyB0aGF0IGEgcGFuIG9wZXJhdGlvbiBmb2xsb3dlZFxuXHRcdCAqIGJ5IGEgem9vbSBvcGVyYXRpb24gaW4gdGhlIHNhbWUgdGhyZWFkIHdpbGwgaW50ZXJmZXJlIHdpdGggZWFjaG90aGVyLiBUaGUgem9vbVxuXHRcdCAqIG9wZXJhdGlvbiBpbnRlcnJ1cHRzL2NhbmNlbHMgdGhlIHBhbiwgcmVzdWx0aW5nIGluIGEgZmluYWwgY2VudGVyIHBvaW50IHRoYXQgaXNcblx0XHQgKiBpbmFjY3VyYXRlLiBUaGUgc29sdXRpb24gc2VlbXMgdG8gYmUgdG8gZWl0aGVyIHNlcGFyYXRlIHRoZW0gd2l0aCBhIHRpbWVvdXQgb3Jcblx0XHQgICogdG8gY29sbGFwc2UgdGhlbSBpbnRvIGEgc2V0VmlldyBjYWxsLlxuXHRcdCAqL1xuXG5cdFx0Ly8gWm9vbWluZyBhbmQgUGFubmluZ1xuXHRcdGlmIChjaGFuZ2VzWyd6b29tJ10gJiYgY2hhbmdlc1snY2VudGVyJ10gJiYgbnVsbCAhPSB0aGlzLnpvb20gJiYgbnVsbCAhPSB0aGlzLmNlbnRlcikge1xuXHRcdFx0dGhpcy5zZXRWaWV3KGNoYW5nZXNbJ2NlbnRlciddLmN1cnJlbnRWYWx1ZSwgY2hhbmdlc1snem9vbSddLmN1cnJlbnRWYWx1ZSk7XG5cdFx0fVxuXHRcdC8vIFNldCB0aGUgem9vbSBsZXZlbFxuXHRcdGVsc2UgaWYgKGNoYW5nZXNbJ3pvb20nXSkge1xuXHRcdFx0dGhpcy5zZXRab29tKGNoYW5nZXNbJ3pvb20nXS5jdXJyZW50VmFsdWUpO1xuXHRcdH1cblx0XHQvLyBTZXQgdGhlIG1hcCBjZW50ZXJcblx0XHRlbHNlIGlmIChjaGFuZ2VzWydjZW50ZXInXSkge1xuXHRcdFx0dGhpcy5zZXRDZW50ZXIoY2hhbmdlc1snY2VudGVyJ10uY3VycmVudFZhbHVlKTtcblx0XHR9XG5cblx0XHQvLyBPdGhlciBvcHRpb25zXG5cdFx0aWYgKGNoYW5nZXNbJ2ZpdEJvdW5kcyddKSB7XG5cdFx0XHR0aGlzLnNldEZpdEJvdW5kcyhjaGFuZ2VzWydmaXRCb3VuZHMnXS5jdXJyZW50VmFsdWUpO1xuXHRcdH1cblxuXHRcdGlmIChjaGFuZ2VzWydtYXhCb3VuZHMnXSkge1xuXHRcdFx0dGhpcy5zZXRNYXhCb3VuZHMoY2hhbmdlc1snbWF4Qm91bmRzJ10uY3VycmVudFZhbHVlKTtcblx0XHR9XG5cblx0XHRpZiAoY2hhbmdlc1snbWluWm9vbSddKSB7XG5cdFx0XHR0aGlzLnNldE1pblpvb20oY2hhbmdlc1snbWluWm9vbSddLmN1cnJlbnRWYWx1ZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGNoYW5nZXNbJ21heFpvb20nXSkge1xuXHRcdFx0dGhpcy5zZXRNYXhab29tKGNoYW5nZXNbJ21heFpvb20nXS5jdXJyZW50VmFsdWUpO1xuXHRcdH1cblxuXHR9XG5cblx0bmdPbkRlc3Ryb3koKSB7XG5cdFx0Ly8gSWYgdGhpcyBkaXJlY3RpdmUgaXMgZGVzdHJveWVkLCB0aGUgbWFwIGlzIHRvb1xuXHRcdGlmIChudWxsICE9IHRoaXMubWFwKSB7XG5cdFx0XHR0aGlzLm1hcC5yZW1vdmUoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0TWFwKCkge1xuXHRcdHJldHVybiB0aGlzLm1hcDtcblx0fVxuXG5cblx0QEhvc3RMaXN0ZW5lcignd2luZG93OnJlc2l6ZScsIFtdKVxuXHRvblJlc2l6ZSgpIHtcblx0XHR0aGlzLmRlbGF5UmVzaXplKCk7XG5cdH1cblxuXHRwcml2YXRlIGFkZE1hcEV2ZW50TGlzdGVuZXJzKCkge1xuXG5cdFx0Y29uc3QgcmVnaXN0ZXJFdmVudEhhbmRsZXIgPSAoZXZlbnROYW1lOiBzdHJpbmcsIGhhbmRsZXI6IChlOiBMZWFmbGV0RXZlbnQpID0+IGFueSkgPT4ge1xuXHRcdFx0dGhpcy5tYXAub24oZXZlbnROYW1lLCBoYW5kbGVyKTtcblx0XHR9O1xuXG5cblx0XHQvLyBBZGQgYWxsIHRoZSBwYXNzLXRocm91Z2ggbW91c2UgZXZlbnQgaGFuZGxlcnNcblx0XHRyZWdpc3RlckV2ZW50SGFuZGxlcignY2xpY2snLCAoZTogTGVhZmxldE1vdXNlRXZlbnQpID0+IExlYWZsZXRVdGlsLmhhbmRsZUV2ZW50KHRoaXMuem9uZSwgdGhpcy5vbkNsaWNrLCBlKSk7XG5cdFx0cmVnaXN0ZXJFdmVudEhhbmRsZXIoJ2RibGNsaWNrJywgKGU6IExlYWZsZXRNb3VzZUV2ZW50KSA9PiBMZWFmbGV0VXRpbC5oYW5kbGVFdmVudCh0aGlzLnpvbmUsIHRoaXMub25Eb3VibGVDbGljaywgZSkpO1xuXHRcdHJlZ2lzdGVyRXZlbnRIYW5kbGVyKCdtb3VzZWRvd24nLCAoZTogTGVhZmxldE1vdXNlRXZlbnQpID0+IExlYWZsZXRVdGlsLmhhbmRsZUV2ZW50KHRoaXMuem9uZSwgdGhpcy5vbk1vdXNlRG93biwgZSkpO1xuXHRcdHJlZ2lzdGVyRXZlbnRIYW5kbGVyKCdtb3VzZXVwJywgKGU6IExlYWZsZXRNb3VzZUV2ZW50KSA9PiBMZWFmbGV0VXRpbC5oYW5kbGVFdmVudCh0aGlzLnpvbmUsIHRoaXMub25Nb3VzZVVwLCBlKSk7XG5cdFx0cmVnaXN0ZXJFdmVudEhhbmRsZXIoJ21vdXNlb3ZlcicsIChlOiBMZWFmbGV0TW91c2VFdmVudCkgPT4gTGVhZmxldFV0aWwuaGFuZGxlRXZlbnQodGhpcy56b25lLCB0aGlzLm9uTW91c2VPdmVyLCBlKSk7XG5cdFx0cmVnaXN0ZXJFdmVudEhhbmRsZXIoJ21vdXNlb3V0JywgKGU6IExlYWZsZXRNb3VzZUV2ZW50KSA9PiBMZWFmbGV0VXRpbC5oYW5kbGVFdmVudCh0aGlzLnpvbmUsIHRoaXMub25Nb3VzZU91dCwgZSkpO1xuXHRcdHJlZ2lzdGVyRXZlbnRIYW5kbGVyKCdtb3VzZW1vdmUnLCAoZTogTGVhZmxldE1vdXNlRXZlbnQpID0+IExlYWZsZXRVdGlsLmhhbmRsZUV2ZW50KHRoaXMuem9uZSwgdGhpcy5vbk1vdXNlTW92ZSwgZSkpO1xuXG5cdFx0cmVnaXN0ZXJFdmVudEhhbmRsZXIoJ3pvb21zdGFydCcsIChlOiBMZWFmbGV0RXZlbnQpID0+IExlYWZsZXRVdGlsLmhhbmRsZUV2ZW50KHRoaXMuem9uZSwgdGhpcy5vbk1hcFpvb21TdGFydCwgZSkpO1xuXHRcdHJlZ2lzdGVyRXZlbnRIYW5kbGVyKCd6b29tJywgKGU6IExlYWZsZXRFdmVudCkgPT4gTGVhZmxldFV0aWwuaGFuZGxlRXZlbnQodGhpcy56b25lLCB0aGlzLm9uTWFwWm9vbSwgZSkpO1xuXHRcdHJlZ2lzdGVyRXZlbnRIYW5kbGVyKCd6b29tZW5kJywgKGU6IExlYWZsZXRFdmVudCkgPT4gTGVhZmxldFV0aWwuaGFuZGxlRXZlbnQodGhpcy56b25lLCB0aGlzLm9uTWFwWm9vbUVuZCwgZSkpO1xuXHRcdHJlZ2lzdGVyRXZlbnRIYW5kbGVyKCdtb3Zlc3RhcnQnLCAoZTogTGVhZmxldEV2ZW50KSA9PiBMZWFmbGV0VXRpbC5oYW5kbGVFdmVudCh0aGlzLnpvbmUsIHRoaXMub25NYXBNb3ZlU3RhcnQsIGUpKTtcblx0XHRyZWdpc3RlckV2ZW50SGFuZGxlcignbW92ZScsIChlOiBMZWFmbGV0RXZlbnQpID0+IExlYWZsZXRVdGlsLmhhbmRsZUV2ZW50KHRoaXMuem9uZSwgdGhpcy5vbk1hcE1vdmUsIGUpKTtcblx0XHRyZWdpc3RlckV2ZW50SGFuZGxlcignbW92ZWVuZCcsIChlOiBMZWFmbGV0RXZlbnQpID0+IExlYWZsZXRVdGlsLmhhbmRsZUV2ZW50KHRoaXMuem9uZSwgdGhpcy5vbk1hcE1vdmVFbmQsIGUpKTtcblxuXG5cdFx0Ly8gVXBkYXRlIGFueSB0aGluZ3MgZm9yIHdoaWNoIHdlIHByb3ZpZGUgb3V0cHV0IGJpbmRpbmdzXG5cdFx0Y29uc3Qgb3V0cHV0VXBkYXRlSGFuZGxlciA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHpvb20gPSB0aGlzLm1hcC5nZXRab29tKCk7XG5cdFx0XHRpZiAoem9vbSAhPT0gdGhpcy56b29tKSB7XG5cdFx0XHRcdHRoaXMuem9vbSA9IHpvb207XG5cdFx0XHRcdExlYWZsZXRVdGlsLmhhbmRsZUV2ZW50KHRoaXMuem9uZSwgdGhpcy56b29tQ2hhbmdlLCB6b29tKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY2VudGVyID0gdGhpcy5tYXAuZ2V0Q2VudGVyKCk7XG5cdFx0XHRpZiAobnVsbCAhPSBjZW50ZXIgfHwgbnVsbCAhPSB0aGlzLmNlbnRlcikge1xuXG5cdFx0XHRcdGlmICgoKG51bGwgPT0gY2VudGVyIHx8IG51bGwgPT0gdGhpcy5jZW50ZXIpICYmIGNlbnRlciAhPT0gdGhpcy5jZW50ZXIpXG5cdFx0XHRcdFx0fHwgKGNlbnRlci5sYXQgIT09IHRoaXMuY2VudGVyLmxhdCB8fCBjZW50ZXIubG5nICE9PSB0aGlzLmNlbnRlci5sbmcpKSB7XG5cblx0XHRcdFx0XHR0aGlzLmNlbnRlciA9IGNlbnRlcjtcblx0XHRcdFx0XHRMZWFmbGV0VXRpbC5oYW5kbGVFdmVudCh0aGlzLnpvbmUsIHRoaXMuY2VudGVyQ2hhbmdlLCBjZW50ZXIpO1xuXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0cmVnaXN0ZXJFdmVudEhhbmRsZXIoJ21vdmVlbmQnLCBvdXRwdXRVcGRhdGVIYW5kbGVyKTtcblx0XHRyZWdpc3RlckV2ZW50SGFuZGxlcignem9vbWVuZCcsIG91dHB1dFVwZGF0ZUhhbmRsZXIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc2l6ZSB0aGUgbWFwIHRvIGZpdCBpdCdzIHBhcmVudCBjb250YWluZXJcblx0ICovXG5cdHByaXZhdGUgZG9SZXNpemUoKSB7XG5cblx0XHQvLyBSdW4gdGhpcyBvdXRzaWRlIG9mIGFuZ3VsYXIgc28gdGhlIG1hcCBldmVudHMgc3RheSBvdXRzaWRlIG9mIGFuZ3VsYXJcblx0XHR0aGlzLnpvbmUucnVuT3V0c2lkZUFuZ3VsYXIoKCkgPT4ge1xuXG5cdFx0XHQvLyBJbnZhbGlkYXRlIHRoZSBtYXAgc2l6ZSB0byB0cmlnZ2VyIGl0IHRvIHVwZGF0ZSBpdHNlbGZcblx0XHRcdGlmIChudWxsICE9IHRoaXMubWFwKSB7XG5cdFx0XHRcdHRoaXMubWFwLmludmFsaWRhdGVTaXplKHt9KTtcblx0XHRcdH1cblxuXHRcdH0pO1xuXG5cdH1cblxuXHQvKipcblx0ICogTWFuYWdlIGEgZGVsYXllZCByZXNpemUgb2YgdGhlIGNvbXBvbmVudFxuXHQgKi9cblx0cHJpdmF0ZSBkZWxheVJlc2l6ZSgpIHtcblx0XHRpZiAobnVsbCAhPSB0aGlzLnJlc2l6ZVRpbWVyKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5yZXNpemVUaW1lcik7XG5cdFx0fVxuXHRcdHRoaXMucmVzaXplVGltZXIgPSBzZXRUaW1lb3V0KHRoaXMuZG9SZXNpemUuYmluZCh0aGlzKSwgMjAwKTtcblx0fVxuXG5cblx0LyoqXG5cdCAqIFNldCB0aGUgdmlldyAoY2VudGVyL3pvb20pIGFsbCBhdCBvbmNlXG5cdCAqIEBwYXJhbSBjZW50ZXIgVGhlIG5ldyBjZW50ZXJcblx0ICogQHBhcmFtIHpvb20gVGhlIG5ldyB6b29tIGxldmVsXG5cdCAqL1xuXHRwcml2YXRlIHNldFZpZXcoY2VudGVyOiBMYXRMbmcsIHpvb206IG51bWJlcikge1xuXG5cdFx0aWYgKG51bGwgIT0gdGhpcy5tYXAgJiYgbnVsbCAhPSBjZW50ZXIgJiYgbnVsbCAhPSB6b29tKSB7XG5cdFx0XHR0aGlzLm1hcC5zZXRWaWV3KGNlbnRlciwgem9vbSwgdGhpcy56b29tUGFuT3B0aW9ucyk7XG5cdFx0fVxuXG5cdH1cblxuXHQvKipcblx0ICogU2V0IHRoZSBtYXAgem9vbSBsZXZlbFxuXHQgKiBAcGFyYW0gem9vbSB0aGUgbmV3IHpvb20gbGV2ZWwgZm9yIHRoZSBtYXBcblx0ICovXG5cdHByaXZhdGUgc2V0Wm9vbSh6b29tOiBudW1iZXIpIHtcblxuXHRcdGlmIChudWxsICE9IHRoaXMubWFwICYmIG51bGwgIT0gem9vbSkge1xuXHRcdFx0dGhpcy5tYXAuc2V0Wm9vbSh6b29tLCB0aGlzLnpvb21PcHRpb25zKTtcblx0XHR9XG5cblx0fVxuXG5cdC8qKlxuXHQgKiBTZXQgdGhlIGNlbnRlciBvZiB0aGUgbWFwXG5cdCAqIEBwYXJhbSBjZW50ZXIgdGhlIGNlbnRlciBwb2ludFxuXHQgKi9cblx0cHJpdmF0ZSBzZXRDZW50ZXIoY2VudGVyOiBMYXRMbmcpIHtcblxuXHRcdGlmIChudWxsICE9IHRoaXMubWFwICYmIG51bGwgIT0gY2VudGVyKSB7XG5cdFx0XHR0aGlzLm1hcC5wYW5UbyhjZW50ZXIsIHRoaXMucGFuT3B0aW9ucyk7XG5cdFx0fVxuXG5cdH1cblxuXHQvKipcblx0ICogRml0IHRoZSBtYXAgdG8gdGhlIGJvdW5kc1xuXHQgKiBAcGFyYW0gbGF0TG5nQm91bmRzIHRoZSBib3VuZGFyeSB0byBzZXRcblx0ICovXG5cdHByaXZhdGUgc2V0Rml0Qm91bmRzKGxhdExuZ0JvdW5kczogTGF0TG5nQm91bmRzKSB7XG5cblx0XHRpZiAobnVsbCAhPSB0aGlzLm1hcCAmJiBudWxsICE9IGxhdExuZ0JvdW5kcykge1xuXHRcdFx0dGhpcy5tYXAuZml0Qm91bmRzKGxhdExuZ0JvdW5kcywgdGhpcy5maXRCb3VuZHNPcHRpb25zKTtcblx0XHR9XG5cblx0fVxuXG5cdC8qKlxuXHQgKiBTZXQgdGhlIG1hcCdzIG1heCBib3VuZHNcblx0ICogQHBhcmFtIGxhdExuZ0JvdW5kcyB0aGUgYm91bmRhcnkgdG8gc2V0XG5cdCAqL1xuXHRwcml2YXRlIHNldE1heEJvdW5kcyhsYXRMbmdCb3VuZHM6IExhdExuZ0JvdW5kcykge1xuXG5cdFx0aWYgKG51bGwgIT0gdGhpcy5tYXAgJiYgbnVsbCAhPSBsYXRMbmdCb3VuZHMpIHtcblx0XHRcdHRoaXMubWFwLnNldE1heEJvdW5kcyhsYXRMbmdCb3VuZHMpO1xuXHRcdH1cblxuXHR9XG5cblx0LyoqXG5cdCAqIFNldCB0aGUgbWFwJ3MgbWluIHpvb21cblx0ICogQHBhcmFtIG51bWJlciB0aGUgbmV3IG1pbiB6b29tXG5cdCAqL1xuXHRwcml2YXRlIHNldE1pblpvb20oem9vbTogbnVtYmVyKSB7XG5cblx0XHRpZiAobnVsbCAhPSB0aGlzLm1hcCAmJiBudWxsICE9IHpvb20pIHtcblx0XHRcdHRoaXMubWFwLnNldE1pblpvb20oem9vbSk7XG5cdFx0fVxuXG5cdH1cblxuXHQvKipcblx0ICogU2V0IHRoZSBtYXAncyBtaW4gem9vbVxuXHQgKiBAcGFyYW0gbnVtYmVyIHRoZSBuZXcgbWluIHpvb21cblx0ICovXG5cdHByaXZhdGUgc2V0TWF4Wm9vbSh6b29tOiBudW1iZXIpIHtcblxuXHRcdGlmIChudWxsICE9IHRoaXMubWFwICYmIG51bGwgIT0gem9vbSkge1xuXHRcdFx0dGhpcy5tYXAuc2V0TWF4Wm9vbSh6b29tKTtcblx0XHR9XG5cblx0fVxuXG59XG4iXX0=