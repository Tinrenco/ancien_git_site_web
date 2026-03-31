import { Directive, EventEmitter, Input, Output } from '@angular/core';
import { LeafletDirectiveWrapper } from '../core/leaflet.directive.wrapper';
import { LeafletUtil } from '../core/leaflet.util';
import * as i0 from "@angular/core";
import * as i1 from "../core/leaflet.directive";
/**
 * Layer directive
 *
 * This directive is used to directly control a single map layer. The purpose of this directive is to
 * be used as part of a child structural directive of the map element.
 *
 */
export class LeafletLayerDirective {
    constructor(leafletDirective, zone) {
        this.zone = zone;
        // Layer Events
        this.onAdd = new EventEmitter();
        this.onRemove = new EventEmitter();
        this.leafletDirective = new LeafletDirectiveWrapper(leafletDirective);
    }
    ngOnInit() {
        // Init the map
        this.leafletDirective.init();
    }
    ngOnDestroy() {
        if (null != this.layer) {
            // Unregister the event handlers
            this.removeLayerEventListeners(this.layer);
            // Remove the layer from the map
            this.layer.remove();
        }
    }
    ngOnChanges(changes) {
        if (changes['layer']) {
            // Update the layer
            const p = changes['layer'].previousValue;
            const n = changes['layer'].currentValue;
            this.zone.runOutsideAngular(() => {
                if (null != p) {
                    this.removeLayerEventListeners(p);
                    p.remove();
                }
                if (null != n) {
                    this.addLayerEventListeners(n);
                    this.leafletDirective.getMap().addLayer(n);
                }
            });
        }
    }
    addLayerEventListeners(l) {
        this.onAddLayerHandler = (e) => LeafletUtil.handleEvent(this.zone, this.onAdd, e);
        l.on('add', this.onAddLayerHandler);
        this.onRemoveLayerHandler = (e) => LeafletUtil.handleEvent(this.zone, this.onRemove, e);
        l.on('remove', this.onRemoveLayerHandler);
    }
    removeLayerEventListeners(l) {
        l.off('add', this.onAddLayerHandler);
        l.off('remove', this.onRemoveLayerHandler);
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "18.0.1", ngImport: i0, type: LeafletLayerDirective, deps: [{ token: i1.LeafletDirective }, { token: i0.NgZone }], target: i0.ɵɵFactoryTarget.Directive }); }
    static { this.ɵdir = i0.ɵɵngDeclareDirective({ minVersion: "14.0.0", version: "18.0.1", type: LeafletLayerDirective, selector: "[leafletLayer]", inputs: { layer: ["leafletLayer", "layer"] }, outputs: { onAdd: "leafletLayerAdd", onRemove: "leafletLayerRemove" }, usesOnChanges: true, ngImport: i0 }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "18.0.1", ngImport: i0, type: LeafletLayerDirective, decorators: [{
            type: Directive,
            args: [{
                    selector: '[leafletLayer]'
                }]
        }], ctorParameters: () => [{ type: i1.LeafletDirective }, { type: i0.NgZone }], propDecorators: { layer: [{
                type: Input,
                args: ['leafletLayer']
            }], onAdd: [{
                type: Output,
                args: ['leafletLayerAdd']
            }], onRemove: [{
                type: Output,
                args: ['leafletLayerRemove']
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGVhZmxldC1sYXllci5kaXJlY3RpdmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9wcm9qZWN0cy9uZ3gtbGVhZmxldC9zcmMvbGliL2xheWVycy9sZWFmbGV0LWxheWVyLmRpcmVjdGl2ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQ04sU0FBUyxFQUFFLFlBQVksRUFBRSxLQUFLLEVBQXdDLE1BQU0sRUFFNUUsTUFBTSxlQUFlLENBQUM7QUFLdkIsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDNUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHNCQUFzQixDQUFDOzs7QUFHbkQ7Ozs7OztHQU1HO0FBSUgsTUFBTSxPQUFPLHFCQUFxQjtJQWdCakMsWUFBWSxnQkFBa0MsRUFBVSxJQUFZO1FBQVosU0FBSSxHQUFKLElBQUksQ0FBUTtRQVhwRSxlQUFlO1FBQ1ksVUFBSyxHQUFHLElBQUksWUFBWSxFQUFnQixDQUFDO1FBQ3RDLGFBQVEsR0FBRyxJQUFJLFlBQVksRUFBZ0IsQ0FBQztRQVV6RSxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSx1QkFBdUIsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBQ3ZFLENBQUM7SUFFRCxRQUFRO1FBRVAsZUFBZTtRQUNmLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUU5QixDQUFDO0lBRUQsV0FBVztRQUVWLElBQUksSUFBSSxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUV4QixnQ0FBZ0M7WUFDaEMsSUFBSSxDQUFDLHlCQUF5QixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUUzQyxnQ0FBZ0M7WUFDaEMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNyQixDQUFDO0lBRUYsQ0FBQztJQUVELFdBQVcsQ0FBQyxPQUF3QztRQUVuRCxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBRXRCLG1CQUFtQjtZQUNuQixNQUFNLENBQUMsR0FBVSxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsYUFBYSxDQUFDO1lBQ2hELE1BQU0sQ0FBQyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxZQUFZLENBQUM7WUFFeEMsSUFBSSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLEVBQUU7Z0JBQ2hDLElBQUksSUFBSSxJQUFJLENBQUMsRUFBRSxDQUFDO29CQUNmLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDbEMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUNaLENBQUM7Z0JBQ0QsSUFBSSxJQUFJLElBQUksQ0FBQyxFQUFFLENBQUM7b0JBQ2YsSUFBSSxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUMvQixJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM1QyxDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUM7UUFFSixDQUFDO0lBRUYsQ0FBQztJQUVPLHNCQUFzQixDQUFDLENBQVE7UUFFdEMsSUFBSSxDQUFDLGlCQUFpQixHQUFHLENBQUMsQ0FBZSxFQUFFLEVBQUUsQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNoRyxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUVwQyxJQUFJLENBQUMsb0JBQW9CLEdBQUcsQ0FBQyxDQUFlLEVBQUUsRUFBRSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3RHLENBQUMsQ0FBQyxFQUFFLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0lBRTNDLENBQUM7SUFFTyx5QkFBeUIsQ0FBQyxDQUFRO1FBRXpDLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQ3JDLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0lBRTVDLENBQUM7OEdBOUVXLHFCQUFxQjtrR0FBckIscUJBQXFCOzsyRkFBckIscUJBQXFCO2tCQUhqQyxTQUFTO21CQUFDO29CQUNWLFFBQVEsRUFBRSxnQkFBZ0I7aUJBQzFCOzBHQUl1QixLQUFLO3NCQUEzQixLQUFLO3VCQUFDLGNBQWM7Z0JBR00sS0FBSztzQkFBL0IsTUFBTTt1QkFBQyxpQkFBaUI7Z0JBQ0ssUUFBUTtzQkFBckMsTUFBTTt1QkFBQyxvQkFBb0IiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuXHREaXJlY3RpdmUsIEV2ZW50RW1pdHRlciwgSW5wdXQsIE5nWm9uZSwgT25DaGFuZ2VzLCBPbkRlc3Ryb3ksIE9uSW5pdCwgT3V0cHV0LFxuXHRTaW1wbGVDaGFuZ2Vcbn0gZnJvbSAnQGFuZ3VsYXIvY29yZSc7XG5cbmltcG9ydCB7IExheWVyLCBMZWFmbGV0RXZlbnQgfSBmcm9tICdsZWFmbGV0JztcblxuaW1wb3J0IHsgTGVhZmxldERpcmVjdGl2ZSB9IGZyb20gJy4uL2NvcmUvbGVhZmxldC5kaXJlY3RpdmUnO1xuaW1wb3J0IHsgTGVhZmxldERpcmVjdGl2ZVdyYXBwZXIgfSBmcm9tICcuLi9jb3JlL2xlYWZsZXQuZGlyZWN0aXZlLndyYXBwZXInO1xuaW1wb3J0IHsgTGVhZmxldFV0aWwgfSBmcm9tICcuLi9jb3JlL2xlYWZsZXQudXRpbCc7XG5cblxuLyoqXG4gKiBMYXllciBkaXJlY3RpdmVcbiAqXG4gKiBUaGlzIGRpcmVjdGl2ZSBpcyB1c2VkIHRvIGRpcmVjdGx5IGNvbnRyb2wgYSBzaW5nbGUgbWFwIGxheWVyLiBUaGUgcHVycG9zZSBvZiB0aGlzIGRpcmVjdGl2ZSBpcyB0b1xuICogYmUgdXNlZCBhcyBwYXJ0IG9mIGEgY2hpbGQgc3RydWN0dXJhbCBkaXJlY3RpdmUgb2YgdGhlIG1hcCBlbGVtZW50LlxuICpcbiAqL1xuQERpcmVjdGl2ZSh7XG5cdHNlbGVjdG9yOiAnW2xlYWZsZXRMYXllcl0nXG59KVxuZXhwb3J0IGNsYXNzIExlYWZsZXRMYXllckRpcmVjdGl2ZVxuXHRpbXBsZW1lbnRzIE9uQ2hhbmdlcywgT25EZXN0cm95LCBPbkluaXQge1xuXG5cdEBJbnB1dCgnbGVhZmxldExheWVyJykgbGF5ZXI6IExheWVyO1xuXG5cdC8vIExheWVyIEV2ZW50c1xuXHRAT3V0cHV0KCdsZWFmbGV0TGF5ZXJBZGQnKSBvbkFkZCA9IG5ldyBFdmVudEVtaXR0ZXI8TGVhZmxldEV2ZW50PigpO1xuXHRAT3V0cHV0KCdsZWFmbGV0TGF5ZXJSZW1vdmUnKSBvblJlbW92ZSA9IG5ldyBFdmVudEVtaXR0ZXI8TGVhZmxldEV2ZW50PigpO1xuXG5cdC8vIExheWVyIEV2ZW50IGhhbmRsZXJzXG5cdHByaXZhdGUgb25BZGRMYXllckhhbmRsZXI6IGFueTtcblx0cHJpdmF0ZSBvblJlbW92ZUxheWVySGFuZGxlcjogYW55O1xuXG5cdC8vIFdyYXBwZXIgZm9yIHRoZSBsZWFmbGV0IGRpcmVjdGl2ZSAobWFuYWdlcyB0aGUgcGFyZW50IGRpcmVjdGl2ZSlcblx0cHJpdmF0ZSBsZWFmbGV0RGlyZWN0aXZlOiBMZWFmbGV0RGlyZWN0aXZlV3JhcHBlcjtcblxuXHRjb25zdHJ1Y3RvcihsZWFmbGV0RGlyZWN0aXZlOiBMZWFmbGV0RGlyZWN0aXZlLCBwcml2YXRlIHpvbmU6IE5nWm9uZSkge1xuXHRcdHRoaXMubGVhZmxldERpcmVjdGl2ZSA9IG5ldyBMZWFmbGV0RGlyZWN0aXZlV3JhcHBlcihsZWFmbGV0RGlyZWN0aXZlKTtcblx0fVxuXG5cdG5nT25Jbml0KCkge1xuXG5cdFx0Ly8gSW5pdCB0aGUgbWFwXG5cdFx0dGhpcy5sZWFmbGV0RGlyZWN0aXZlLmluaXQoKTtcblxuXHR9XG5cblx0bmdPbkRlc3Ryb3koKSB7XG5cblx0XHRpZiAobnVsbCAhPSB0aGlzLmxheWVyKSB7XG5cblx0XHRcdC8vIFVucmVnaXN0ZXIgdGhlIGV2ZW50IGhhbmRsZXJzXG5cdFx0XHR0aGlzLnJlbW92ZUxheWVyRXZlbnRMaXN0ZW5lcnModGhpcy5sYXllcik7XG5cblx0XHRcdC8vIFJlbW92ZSB0aGUgbGF5ZXIgZnJvbSB0aGUgbWFwXG5cdFx0XHR0aGlzLmxheWVyLnJlbW92ZSgpO1xuXHRcdH1cblxuXHR9XG5cblx0bmdPbkNoYW5nZXMoY2hhbmdlczogeyBba2V5OiBzdHJpbmddOiBTaW1wbGVDaGFuZ2UgfSkge1xuXG5cdFx0aWYgKGNoYW5nZXNbJ2xheWVyJ10pIHtcblxuXHRcdFx0Ly8gVXBkYXRlIHRoZSBsYXllclxuXHRcdFx0Y29uc3QgcDogTGF5ZXIgPSBjaGFuZ2VzWydsYXllciddLnByZXZpb3VzVmFsdWU7XG5cdFx0XHRjb25zdCBuID0gY2hhbmdlc1snbGF5ZXInXS5jdXJyZW50VmFsdWU7XG5cblx0XHRcdHRoaXMuem9uZS5ydW5PdXRzaWRlQW5ndWxhcigoKSA9PiB7XG5cdFx0XHRcdGlmIChudWxsICE9IHApIHtcblx0XHRcdFx0XHR0aGlzLnJlbW92ZUxheWVyRXZlbnRMaXN0ZW5lcnMocCk7XG5cdFx0XHRcdFx0cC5yZW1vdmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobnVsbCAhPSBuKSB7XG5cdFx0XHRcdFx0dGhpcy5hZGRMYXllckV2ZW50TGlzdGVuZXJzKG4pO1xuXHRcdFx0XHRcdHRoaXMubGVhZmxldERpcmVjdGl2ZS5nZXRNYXAoKS5hZGRMYXllcihuKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHR9XG5cblx0fVxuXG5cdHByaXZhdGUgYWRkTGF5ZXJFdmVudExpc3RlbmVycyhsOiBMYXllcikge1xuXG5cdFx0dGhpcy5vbkFkZExheWVySGFuZGxlciA9IChlOiBMZWFmbGV0RXZlbnQpID0+IExlYWZsZXRVdGlsLmhhbmRsZUV2ZW50KHRoaXMuem9uZSwgdGhpcy5vbkFkZCwgZSk7XG5cdFx0bC5vbignYWRkJywgdGhpcy5vbkFkZExheWVySGFuZGxlcik7XG5cblx0XHR0aGlzLm9uUmVtb3ZlTGF5ZXJIYW5kbGVyID0gKGU6IExlYWZsZXRFdmVudCkgPT4gTGVhZmxldFV0aWwuaGFuZGxlRXZlbnQodGhpcy56b25lLCB0aGlzLm9uUmVtb3ZlLCBlKTtcblx0XHRsLm9uKCdyZW1vdmUnLCB0aGlzLm9uUmVtb3ZlTGF5ZXJIYW5kbGVyKTtcblxuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVMYXllckV2ZW50TGlzdGVuZXJzKGw6IExheWVyKSB7XG5cblx0XHRsLm9mZignYWRkJywgdGhpcy5vbkFkZExheWVySGFuZGxlcik7XG5cdFx0bC5vZmYoJ3JlbW92ZScsIHRoaXMub25SZW1vdmVMYXllckhhbmRsZXIpO1xuXG5cdH1cblxufVxuIl19