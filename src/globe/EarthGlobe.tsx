import { useEffect, useRef, useState } from 'react';
import {
  BoundingSphere, Cartesian2, Cartesian3, Cartographic, CesiumTerrainProvider,
  Color, Credit, DistanceDisplayCondition, EllipsoidTerrainProvider, Entity, HeadingPitchRange, HeightReference,
  ImageryLayer, IonImageryProvider, IonResource, LabelStyle, Math as CesiumMath, ScreenSpaceEventHandler,
  ScreenSpaceEventType, TileMapServiceImageryProvider, Viewer, buildModuleUrl,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { EarthGlobeProps, GlobeCamera, GlobeLabelsStatus, GlobeStatus } from './contracts';
import { markerPlan, validCoordinates } from './logic';
import { attachSearch } from './search';

export function EarthGlobe(props: EarthGlobeProps) {
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [fatal, setFatal] = useState('');
  const labelsLayer = useRef<ImageryLayer | null>(null);

  useEffect(() => {
    let disposed = false;
    let degraded = false;
    let broken = false;
    let instance: Viewer | undefined;
    const cleanups: (() => void)[] = [];
    const status = (value: GlobeStatus) => { if (!disposed) latest.current.onStatusChange?.(value); };
    const labelsStatus = (value: GlobeLabelsStatus) => { if (!disposed) latest.current.onLabelsStatusChange?.(value); };
    const fail = (code: string, message: string) => {
      if (disposed) return;
      degraded = true;
      latest.current.onError?.({ code, message });
      if (!broken) status('degraded');
    };
    status('initializing');
    setFatal('');
    try {
      instance = new Viewer(container.current!, {
        baseLayer: false, terrainProvider: new EllipsoidTerrainProvider(),
        animation: false, timeline: false, geocoder: false, homeButton: false,
        baseLayerPicker: false, sceneModePicker: false, navigationHelpButton: false,
        fullscreenButton: false, infoBox: false, selectionIndicator: false,
        requestRenderMode: true, maximumRenderTimeChange: Infinity,
      });
      const v = instance;
      setViewer(v);
      v.scene.globe.baseColor = Color.fromCssColorString('#254c61');
      v.scene.globe.depthTestAgainstTerrain = true;
      const initial = latest.current.initialCamera;
      if (initial) {
        if (validCamera(initial)) aim(v, initial, false);
        else fail('INVALID_CAMERA', 'Initial camera contains invalid coordinates, range or angles.');
      } else v.camera.setView({ destination: Cartesian3.fromDegrees(20, 20, 20_000_000) });
      cleanups.push(v.scene.renderError.addEventListener(() => {
        broken = true;
        setFatal('The Earth renderer stopped. Reload the page or try a WebGL-capable browser.');
        latest.current.onError?.({ code: 'RENDER_ERROR', message: 'Cesium rendering failed.' });
        status('error');
      }));
      const handler = new ScreenSpaceEventHandler(v.canvas);
      handler.setInputAction((event: { position: Cartesian2 }) => {
        const picked = v.scene.pick(event.position);
        if (picked?.id instanceof Entity && picked.id.id.startsWith('marker:')) {
          latest.current.onMarkerSelected?.(picked.id.id.slice(7));
          return;
        }
        const ray = v.camera.getPickRay(event.position);
        let position = ray ? v.scene.globe.pick(ray, v.scene) : undefined;
        if (!position) position = v.camera.pickEllipsoid(event.position, v.scene.globe.ellipsoid);
        if (!position) return;
        const point = Cartographic.fromCartesian(position);
        const coordinates = { latitude: CesiumMath.toDegrees(point.latitude), longitude: CesiumMath.toDegrees(point.longitude), heightMeters: point.height };
        if (validCoordinates(coordinates)) latest.current.onCoordinatesSelected?.(coordinates);
      }, ScreenSpaceEventType.LEFT_CLICK);
      cleanups.push(() => handler.destroy());
      const resize = new ResizeObserver(() => { if (!disposed) { v.resize(); v.scene.requestRender(); } });
      resize.observe(container.current!);
      cleanups.push(() => resize.disconnect());
      const reportCamera = () => {
        if (v.isDestroyed()) return;
        const cartographic = Cartographic.fromCartesian(v.camera.positionWC);
        latest.current.onCameraChange?.({
          center: { latitude: CesiumMath.toDegrees(cartographic.latitude), longitude: CesiumMath.toDegrees(cartographic.longitude), heightMeters: cartographic.height },
          rangeMeters: Math.max(1, cartographic.height),
          headingDegrees: CesiumMath.toDegrees(v.camera.heading),
          pitchDegrees: CesiumMath.toDegrees(v.camera.pitch),
        });
      };
      const cameraChanged = (v.camera as Viewer['camera'] & { changed?: { addEventListener: (listener: () => void) => () => void } }).changed;
      if (cameraChanged) cleanups.push(cameraChanged.addEventListener(reportCamera));

      const token = import.meta.env.VITE_CESIUM_ION_TOKEN?.trim();
      const imageryId = Number(import.meta.env.VITE_CESIUM_ION_IMAGERY_ASSET_ID);
      const labelsId = Number(import.meta.env.VITE_CESIUM_ION_LABELS_ASSET_ID);
      const labelsConfigured = !!token && Number.isSafeInteger(labelsId) && labelsId > 0 && labelsId !== imageryId;
      labelsStatus(labelsConfigured ? 'loading' : 'unavailable');
      if (token) {
        try { cleanups.push(attachSearch(v, token, () => fail('GEOCODER_FAILED', 'Location search is unavailable. Check geocode permission and network access.'))); }
        catch { fail('GEOCODER_FAILED', 'Location search could not initialize; globe navigation remains available.'); }
      }
      else fail('ION_UNCONFIGURED', 'Using bundled Natural Earth imagery and ellipsoid terrain. Ion search and terrain require a token.');

      void (async () => {
        try {
          const fallback = await TileMapServiceImageryProvider.fromUrl(buildModuleUrl('Assets/Textures/NaturalEarthII'), { credit: new Credit('Natural Earth (public domain)') });
          if (disposed) return;
          cleanups.push(fallback.errorEvent.addEventListener(() => fail('FALLBACK_IMAGERY_FAILED', 'Bundled imagery failed to load; ellipsoid navigation remains available.')));
          v.imageryLayers.addImageryProvider(fallback);
        } catch { fail('FALLBACK_IMAGERY_FAILED', 'Bundled imagery is unavailable; check Cesium static asset hosting.'); }
        if (disposed) return;
        if (token && Number.isSafeInteger(imageryId) && imageryId > 0) {
          try {
            const imagery = await IonImageryProvider.fromAssetId(imageryId, { accessToken: token });
            if (disposed) return;
            const layer = v.imageryLayers.addImageryProvider(imagery);
            cleanups.push(imagery.errorEvent.addEventListener(() => {
              layer.show = false;
              fail('ION_IMAGERY_FAILED', 'Ion imagery failed; showing bundled Natural Earth imagery.');
              v.scene.requestRender();
            }));
          } catch { fail('ION_IMAGERY_FAILED', 'Ion imagery is unavailable; using bundled Natural Earth imagery.'); }
        } else fail('ION_IMAGERY_UNCONFIGURED', 'Using low-resolution Natural Earth imagery. Configure an ion imagery asset for detailed imagery.');
        if (labelsConfigured && !disposed) {
          try {
            const labelsImagery = await IonImageryProvider.fromAssetId(labelsId, { accessToken: token });
            if (disposed || v.isDestroyed()) return;
            const layer = v.imageryLayers.addImageryProvider(labelsImagery);
            layer.show = latest.current.showLabels !== false;
            labelsLayer.current = layer;
            labelsStatus(layer.show ? 'enabled' : 'hidden');
            cleanups.push(labelsImagery.errorEvent.addEventListener(() => {
              layer.show = false;
              labelsStatus('failed');
              fail('ION_LABELS_FAILED', 'Map labels failed to load; base imagery remains available.');
              v.scene.requestRender();
            }));
            cleanups.push(() => {
              if (labelsLayer.current === layer) labelsLayer.current = null;
              if (!v.isDestroyed()) v.imageryLayers.remove(layer, true);
            });
          } catch {
            labelsStatus('failed');
            fail('ION_LABELS_FAILED', 'Map labels are unavailable; base imagery remains available.');
          }
        }
        if (token && !disposed) {
          try {
            const resource = await IonResource.fromAssetId(1, { accessToken: token });
            if (disposed) return;
            const terrain = await CesiumTerrainProvider.fromUrl(resource);
            if (disposed) return;
            v.terrainProvider = terrain;
            cleanups.push(terrain.errorEvent.addEventListener(() => {
              v.terrainProvider = new EllipsoidTerrainProvider();
              fail('TERRAIN_FAILED', 'Terrain failed; using the WGS84 ellipsoid.');
              v.scene.requestRender();
            }));
          } catch { fail('TERRAIN_FAILED', 'World Terrain is unavailable; using the WGS84 ellipsoid.'); }
        }
        if (!disposed && !broken) {
          // Provider metadata alone does not establish that visible tiles loaded.
          let reported = false;
          cleanups.push(v.scene.postRender.addEventListener(() => {
            if (!reported && !disposed && !broken && v.scene.globe.tilesLoaded) {
              reported = true;
              status(degraded ? 'degraded' : 'ready');
            }
          }));
          v.scene.requestRender();
        }
      })();
    } catch {
      broken = true;
      setFatal('Unable to start the 3D Earth. Enable WebGL and hardware acceleration, then reload.');
      latest.current.onError?.({ code: 'INITIALIZATION_FAILED', message: 'Cesium could not initialize. Check WebGL support and static asset configuration.' });
      status('error');
    }
    return () => {
      if (instance && !instance.isDestroyed() && instance.camera.positionWC) {
        const cartographic = Cartographic.fromCartesian(instance.camera.positionWC);
        latest.current.onCameraChange?.({ center: { latitude: CesiumMath.toDegrees(cartographic.latitude), longitude: CesiumMath.toDegrees(cartographic.longitude), heightMeters: cartographic.height }, rangeMeters: Math.max(1, cartographic.height), headingDegrees: CesiumMath.toDegrees(instance.camera.heading), pitchDegrees: CesiumMath.toDegrees(instance.camera.pitch) });
      }
      disposed = true;
      cleanups.reverse().forEach(cleanup => cleanup());
      if (instance && !instance.isDestroyed()) instance.destroy();
    };
  }, []);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    viewer.entities.removeById('route');
    const coordinates = props.routeGeoJSON?.coordinates;
    if (coordinates && coordinates.length >= 2) {
      viewer.entities.add({ id: 'route', polyline: { positions: Cartesian3.fromDegreesArray(coordinates.flat()), width: 4, material: Color.ORANGE } });
    }
    viewer.scene.requestRender();
  }, [viewer, props.routeGeoJSON]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    const layer = labelsLayer.current;
    if (!layer) return;
    layer.show = props.showLabels !== false;
    latest.current.onLabelsStatusChange?.(layer.show ? 'enabled' : 'hidden');
    viewer.scene.requestRender();
  }, [viewer, props.showLabels]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    const markers = [...(props.markers ?? [])];
    const selection = props.selectedLocation;
    if (selection && !markers.some(marker => marker.id === selection.id)) markers.push({ id: selection.id, label: selection.name, coordinates: selection.coordinates });
    const plan = markerPlan(markers);
    const palette = getComputedStyle(document.documentElement);
    const forestColor = Color.fromCssColorString(palette.getPropertyValue('--color-forest').trim() || '#435a4c');
    const selectedColor = Color.fromCssColorString(palette.getPropertyValue('--color-route').trim() || '#b77e3d');
    if (plan.rejected.length) latest.current.onError?.({ code: 'INVALID_MARKERS', message: 'Invalid coordinates or duplicate marker IDs were skipped (first valid ID wins).' });
    const ids = new Set(plan.accepted.map(marker => `marker:${marker.id}`));
    for (const entity of [...viewer.entities.values]) if (entity.id.startsWith('marker:') && !ids.has(entity.id)) viewer.entities.remove(entity);
    for (const marker of plan.accepted) {
      const id = `marker:${marker.id}`;
      viewer.entities.removeById(id);
      const c = marker.coordinates;
      const selected = selection?.id === marker.id;
      viewer.entities.add({ id, position: Cartesian3.fromDegrees(c.longitude, c.latitude, c.heightMeters ?? 0),
        point: { pixelSize: selected ? 11 : 7, color: selected ? selectedColor : forestColor, outlineColor: Color.WHITE, outlineWidth: 2, distanceDisplayCondition: selected ? undefined : new DistanceDisplayCondition(0, 500_000), heightReference: c.heightMeters === undefined ? HeightReference.CLAMP_TO_GROUND : HeightReference.NONE, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { show: selected, text: marker.label, font: '13px sans-serif', style: LabelStyle.FILL_AND_OUTLINE, outlineWidth: 3, pixelOffset: new Cartesian2(0, -24), heightReference: c.heightMeters === undefined ? HeightReference.CLAMP_TO_GROUND : HeightReference.NONE },
      });
    }
    viewer.scene.requestRender();
  }, [viewer, props.markers, props.selectedLocation]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    viewer.camera.cancelFlight();
    const location = props.selectedLocation;
    if (!location) return;
    if (!validCoordinates(location.coordinates)) {
      latest.current.onError?.({ code: 'INVALID_LOCATION', message: 'Selected location has invalid coordinates.' });
      return;
    }
    const detailedImageryConfigured = !!import.meta.env.VITE_CESIUM_ION_TOKEN?.trim() && Number(import.meta.env.VITE_CESIUM_ION_IMAGERY_ASSET_ID) > 0;
    aim(viewer, { center: location.coordinates, rangeMeters: detailedImageryConfigured ? 100_000 : 2_500_000 }, true);
    latest.current.onLocationSelected?.(location);
  }, [viewer, props.selectedLocation]);

  return <div style={{ width: '100%', height: '100%', minHeight: 320, position: 'relative' }}>
    <div ref={container} style={{ position: 'absolute', inset: 0 }} />
    {fatal && <p role="alert" style={{ position: 'absolute', top: 0, padding: 16, background: '#18222e', color: 'white' }}>{fatal}</p>}
  </div>;
}

function validCamera(camera: GlobeCamera) {
  return validCoordinates(camera.center) && (camera.rangeMeters === undefined || (Number.isFinite(camera.rangeMeters) && camera.rangeMeters > 0)) &&
    (camera.headingDegrees === undefined || Number.isFinite(camera.headingDegrees)) &&
    (camera.pitchDegrees === undefined || (Number.isFinite(camera.pitchDegrees) && camera.pitchDegrees >= -90 && camera.pitchDegrees <= 0));
}

function aim(viewer: Viewer, camera: GlobeCamera, animate: boolean) {
  const c = camera.center;
  viewer.camera.flyToBoundingSphere(new BoundingSphere(Cartesian3.fromDegrees(c.longitude, c.latitude, c.heightMeters ?? 0), 0), {
    duration: animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 1.5 : 0,
    offset: new HeadingPitchRange(CesiumMath.toRadians(camera.headingDegrees ?? 0), CesiumMath.toRadians(camera.pitchDegrees ?? -60), camera.rangeMeters ?? 10_000_000),
  });
}
