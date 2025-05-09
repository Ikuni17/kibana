/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import _ from 'lodash';
import { METRIC_TYPE } from '@kbn/analytics';
import { i18n } from '@kbn/i18n';
import { EmbeddableStateTransfer } from '@kbn/embeddable-plugin/public';
import { ScopedHistory } from '@kbn/core/public';
import { OnSaveProps } from '@kbn/saved-objects-plugin/public';
import type { MapAttributes } from '../../../../common/content_management';
import { APP_ID, MAP_PATH, MAP_SAVED_OBJECT_TYPE } from '../../../../common/constants';
import { createMapStore, MapStore, MapStoreState } from '../../../reducers/store';
import { MapSettings } from '../../../../common/descriptor_types';
import {
  getTimeFilters,
  getMapZoom,
  getMapCenter,
  getLayerListRaw,
  getLayerList,
  getQuery,
  getFilters,
  getMapSettings,
  getLayerListConfigOnly,
} from '../../../selectors/map_selectors';
import {
  setGotoWithCenter,
  setMapSettings,
  replaceLayerList,
  setIsLayerTOCOpen,
  setOpenTOCDetails,
  setHiddenLayers,
} from '../../../actions';
import { getIsLayerTOCOpen, getOpenTOCDetails } from '../../../selectors/ui_selectors';
import { loadFromLibrary, SharingSavedObjectProps } from './load_from_library';
import { saveToLibrary } from './save_to_library';
import { MapSerializedState } from '../../../react_embeddable/types';
import {
  getCoreChrome,
  getIndexPatternService,
  getToasts,
  getSavedObjectsTagging,
  getTimeFilter,
  getUsageCollection,
  getServerless,
} from '../../../kibana_services';
import { LayerDescriptor } from '../../../../common/descriptor_types';
import { copyPersistentState } from '../../../reducers/copy_persistent_state';
import { getBreadcrumbs } from './get_breadcrumbs';
import { DEFAULT_IS_LAYER_TOC_OPEN } from '../../../reducers/ui';
import { createBasemapLayerDescriptor } from '../../../classes/layers/create_basemap_layer_descriptor';
import { whenLicenseInitialized } from '../../../licensed_features';
import { ParsedMapStateJSON, ParsedUiStateJSON } from './types';
import { setAutoOpenLayerWizardId } from '../../../actions/ui_actions';
import { LayerStatsCollector, MapSettingsCollector } from '../../../../common/telemetry';
import { getIndexPatternsFromIds } from '../../../index_pattern_util';
import { extractReferences } from '../../../../common/migrations/references';
import { getByReferenceState, getByValueState } from '../../../react_embeddable/library_transforms';

function setMapSettingsFromEncodedState(settings: Partial<MapSettings>) {
  const decodedCustomIcons = settings.customIcons
    ? // base64 decode svg string
      settings.customIcons.map((icon) => {
        return { ...icon, svg: Buffer.from(icon.svg, 'base64').toString('utf-8') };
      })
    : [];
  return setMapSettings({
    ...settings,
    // Set projection to 'mercator' to avoid changing existing maps
    projection: !settings.projection ? 'mercator' : settings.projection,
    customIcons: decodedCustomIcons,
  });
}

export class SavedMap {
  private _attributes: MapAttributes | null = null;
  private _sharingSavedObjectProps: SharingSavedObjectProps | null = null;
  private readonly _defaultLayers: LayerDescriptor[];
  private readonly _embeddableId?: string;
  private _initialLayerListConfig: LayerDescriptor[] = [];
  private _mapSerializedState?: MapSerializedState;
  private readonly _onSaveCallback?: () => void;
  private _originatingApp?: string;
  private _originatingPath?: string;
  private readonly _stateTransfer?: EmbeddableStateTransfer;
  private readonly _store: MapStore;
  private _tags: string[] = [];
  private _defaultLayerWizard: string;
  private _managed: boolean;

  constructor({
    defaultLayers = [],
    mapSerializedState,
    embeddableId,
    onSaveCallback,
    originatingApp,
    stateTransfer,
    originatingPath,
    defaultLayerWizard,
  }: {
    defaultLayers?: LayerDescriptor[];
    mapSerializedState?: MapSerializedState;
    embeddableId?: string;
    onSaveCallback?: () => void;
    originatingApp?: string;
    stateTransfer?: EmbeddableStateTransfer;
    originatingPath?: string;
    defaultLayerWizard?: string;
  }) {
    this._defaultLayers = defaultLayers;
    this._mapSerializedState = mapSerializedState;
    this._embeddableId = embeddableId;
    this._onSaveCallback = onSaveCallback;
    this._originatingApp = originatingApp;
    this._originatingPath = originatingPath;
    this._stateTransfer = stateTransfer;
    this._store = createMapStore();
    this._defaultLayerWizard = defaultLayerWizard || '';
    this._managed = false;
  }

  public getStore() {
    return this._store;
  }

  public async reset(mapSerializedState: MapSerializedState) {
    this._mapSerializedState = mapSerializedState;
    await this.whenReady();
  }

  async whenReady() {
    await whenLicenseInitialized();

    if (this._mapSerializedState?.savedObjectId) {
      const { attributes, managed, references, sharingSavedObjectProps } = await loadFromLibrary(
        this._mapSerializedState.savedObjectId
      );
      this._attributes = attributes;
      if (sharingSavedObjectProps) {
        this._sharingSavedObjectProps = sharingSavedObjectProps;
      }
      this._managed = managed;
      const savedObjectsTagging = getSavedObjectsTagging();
      if (savedObjectsTagging && references && references.length) {
        this._tags = savedObjectsTagging.ui.getTagIdsFromReferences(references);
      }
    } else {
      this._attributes = this._mapSerializedState?.attributes
        ? this._mapSerializedState.attributes
        : {
            title: '',
          };
    }

    this._reportUsage();

    if (this._attributes?.mapStateJSON) {
      try {
        const mapState = JSON.parse(this._attributes.mapStateJSON) as ParsedMapStateJSON;
        if (mapState.adHocDataViews && mapState.adHocDataViews.length > 0) {
          const dataViewService = getIndexPatternService();
          const promises = mapState.adHocDataViews.map((spec) => {
            return dataViewService.create(spec);
          });
          await Promise.all(promises);
        }
      } catch (e) {
        // ignore malformed mapStateJSON, not a critical error for viewing map - map will just use defaults
      }
    }

    if (this._mapSerializedState?.mapSettings !== undefined) {
      this._store.dispatch(setMapSettingsFromEncodedState(this._mapSerializedState.mapSettings));
    } else if (this._attributes?.mapStateJSON) {
      try {
        const mapState = JSON.parse(this._attributes.mapStateJSON) as ParsedMapStateJSON;
        if (mapState.settings) {
          this._store.dispatch(setMapSettingsFromEncodedState(mapState.settings));
        }
      } catch (e) {
        // ignore malformed mapStateJSON, not a critical error for viewing map - map will just use defaults
      }
    }

    let isLayerTOCOpen = DEFAULT_IS_LAYER_TOC_OPEN;
    if (this._mapSerializedState?.isLayerTOCOpen !== undefined) {
      isLayerTOCOpen = this._mapSerializedState.isLayerTOCOpen;
    } else if (this._attributes?.uiStateJSON) {
      try {
        const uiState = JSON.parse(this._attributes.uiStateJSON) as ParsedUiStateJSON;
        if ('isLayerTOCOpen' in uiState) {
          isLayerTOCOpen = uiState.isLayerTOCOpen;
        }
      } catch (e) {
        // ignore malformed uiStateJSON, not a critical error for viewing map - map will just use defaults
      }
    }
    this._store.dispatch(setIsLayerTOCOpen(isLayerTOCOpen));

    let openTOCDetails: string[] = [];
    if (this._mapSerializedState?.openTOCDetails !== undefined) {
      openTOCDetails = this._mapSerializedState.openTOCDetails;
    } else if (this._attributes?.uiStateJSON) {
      try {
        const uiState = JSON.parse(this._attributes.uiStateJSON) as ParsedUiStateJSON;
        if ('openTOCDetails' in uiState) {
          openTOCDetails = uiState.openTOCDetails;
        }
      } catch (e) {
        // ignore malformed uiStateJSON, not a critical error for viewing map - map will just use defaults
      }
    }
    this._store.dispatch(setOpenTOCDetails(openTOCDetails));

    if (this._mapSerializedState?.mapCenter !== undefined) {
      this._store.dispatch(
        setGotoWithCenter({
          lat: this._mapSerializedState.mapCenter.lat,
          lon: this._mapSerializedState.mapCenter.lon,
          zoom: this._mapSerializedState.mapCenter.zoom,
        })
      );
    } else if (this._attributes?.mapStateJSON) {
      try {
        const mapState = JSON.parse(this._attributes.mapStateJSON) as ParsedMapStateJSON;
        this._store.dispatch(
          setGotoWithCenter({
            lat: mapState.center.lat,
            lon: mapState.center.lon,
            zoom: mapState.zoom,
          })
        );
      } catch (e) {
        // ignore malformed mapStateJSON, not a critical error for viewing map - map will just use defaults
      }
    }

    let layerList: LayerDescriptor[] = [];
    if (this._attributes.layerListJSON) {
      try {
        layerList = JSON.parse(this._attributes.layerListJSON) as LayerDescriptor[];
      } catch (e) {
        throw new Error('Malformed saved object: unable to parse layerListJSON');
      }
    } else {
      const basemapLayerDescriptor = createBasemapLayerDescriptor();
      if (basemapLayerDescriptor) {
        layerList.push(basemapLayerDescriptor);
      }
      if (this._defaultLayers.length) {
        layerList.push(...this._defaultLayers);
      }
    }
    this._store.dispatch<any>(replaceLayerList(layerList));
    if (this._mapSerializedState?.hiddenLayers !== undefined) {
      this._store.dispatch<any>(setHiddenLayers(this._mapSerializedState.hiddenLayers));
    }
    this._initialLayerListConfig = copyPersistentState(layerList);

    if (this._defaultLayerWizard) {
      this._store.dispatch<any>(setAutoOpenLayerWizardId(this._defaultLayerWizard));
    }
  }

  hasUnsavedChanges = () => {
    if (!this._attributes) {
      throw new Error('Invalid usage, must await whenReady before calling hasUnsavedChanges');
    }

    const savedLayerList = this._attributes.layerListJSON
      ? JSON.parse(this._attributes.layerListJSON)
      : null;
    const layerListConfigOnly = getLayerListConfigOnly(this._store.getState());
    return !savedLayerList
      ? !_.isEqual(layerListConfigOnly, this._initialLayerListConfig)
      : // savedMap stores layerList as a JSON string using JSON.stringify.
        // JSON.stringify removes undefined properties from objects.
        // savedMap.getLayerList converts the JSON string back into Javascript array of objects.
        // Need to perform the same process for layerListConfigOnly to compare apples to apples
        // and avoid undefined properties in layerListConfigOnly triggering unsaved changes.
        !_.isEqual(JSON.parse(JSON.stringify(layerListConfigOnly)), savedLayerList);
  };

  private _getStateTransfer() {
    if (!this._stateTransfer) {
      throw new Error('stateTransfer not provided in constructor');
    }

    return this._stateTransfer;
  }

  private _getPageTitle(): string {
    if (!this._mapSerializedState) {
      return i18n.translate('xpack.maps.breadcrumbsCreate', {
        defaultMessage: 'Create',
      });
    }

    return this.isByValue()
      ? i18n.translate('xpack.maps.breadcrumbsEditByValue', {
          defaultMessage: 'Edit map',
        })
      : this._attributes!.title;
  }

  private _reportUsage(): void {
    const usageCollector = getUsageCollection();
    if (!usageCollector || !this._attributes) {
      return;
    }

    const mapSettingsStatsCollector = new MapSettingsCollector(this._attributes);

    const layerStatsCollector = new LayerStatsCollector(this._attributes);

    const uiCounterEvents = {
      layer: layerStatsCollector.getLayerCounts(),
      scaling: layerStatsCollector.getScalingCounts(),
      resolution: layerStatsCollector.getResolutionCounts(),
      join: layerStatsCollector.getJoinCounts(),
      ems_basemap: layerStatsCollector.getBasemapCounts(),
      settings: {
        custom_icons_count: mapSettingsStatsCollector.getCustomIconsCount(),
      },
    };

    for (const [eventType, eventTypeMetrics] of Object.entries(uiCounterEvents)) {
      for (const [eventName, count] of Object.entries(eventTypeMetrics)) {
        usageCollector.reportUiCounter(
          APP_ID,
          METRIC_TYPE.LOADED,
          `${eventType}_${eventName}`,
          count
        );
      }
    }
  }

  setBreadcrumbs(history: ScopedHistory) {
    if (!this._attributes) {
      throw new Error('Invalid usage, must await whenReady before calling hasUnsavedChanges');
    }

    if (getServerless()) {
      // TODO: https://github.com/elastic/kibana/issues/163488
      // for now, serverless breadcrumbs only set the title,
      // the rest of the breadcrumbs are handled by the serverless navigation
      // the serverless navigation is not yet aware of the byValue/originatingApp context
      getServerless()!.setBreadcrumbs({ text: this._getPageTitle() });
    } else {
      const breadcrumbs = getBreadcrumbs({
        pageTitle: this._getPageTitle(),
        isByValue: this.isByValue(),
        getHasUnsavedChanges: this.hasUnsavedChanges,
        originatingApp: this._originatingApp,
        getAppNameFromId: this._getStateTransfer().getAppNameFromId,
        history,
      });
      getCoreChrome().setBreadcrumbs(breadcrumbs);
    }
  }

  public getSavedObjectId(): string | undefined {
    return this._mapSerializedState?.savedObjectId
      ? this._mapSerializedState.savedObjectId
      : undefined;
  }

  public getOriginatingApp(): string | undefined {
    return this._originatingApp;
  }

  public getOriginatingAppName(): string | undefined {
    return this._originatingApp ? this.getAppNameFromId(this._originatingApp) : undefined;
  }

  public hasOriginatingApp(): boolean {
    return !!this._originatingApp;
  }

  public getOriginatingPath(): string | undefined {
    return this._originatingPath;
  }

  public getAppNameFromId = (appId: string): string | undefined => {
    return this._getStateTransfer().getAppNameFromId(appId);
  };

  public getTags(): string[] {
    return this._tags;
  }

  public hasSaveAndReturnConfig() {
    const hasOriginatingApp = this.hasOriginatingApp();
    return hasOriginatingApp;
  }

  public getTitle(): string {
    if (!this._attributes) {
      throw new Error('Invalid usage, must await getTitle before calling getAttributes');
    }
    return this._attributes.title !== undefined ? this._attributes.title : '';
  }

  public getAttributes(): MapAttributes {
    if (!this._attributes) {
      throw new Error('Invalid usage, must await whenReady before calling getAttributes');
    }

    return this._attributes;
  }

  public getAutoFitToBounds(): boolean {
    if (this._mapSerializedState?.mapSettings?.autoFitToDataBounds !== undefined) {
      return this._mapSerializedState.mapSettings.autoFitToDataBounds;
    }

    if (!this._attributes || !this._attributes.mapStateJSON) {
      return false;
    }

    try {
      const mapState = JSON.parse(this._attributes.mapStateJSON) as ParsedMapStateJSON;
      if (mapState?.settings.autoFitToDataBounds !== undefined) {
        return mapState.settings.autoFitToDataBounds;
      }
    } catch (e) {
      // ignore malformed mapStateJSON, not a critical error for viewing map - map will just use defaults
    }

    return false;
  }

  public getSharingSavedObjectProps(): SharingSavedObjectProps | null {
    return this._sharingSavedObjectProps;
  }

  public isManaged(): boolean {
    return this._managed;
  }

  public isByValue(): boolean {
    const hasSavedObjectId = !!this.getSavedObjectId();
    return !!this._originatingApp && !hasSavedObjectId;
  }

  public async save({
    newDescription,
    newTitle,
    newCopyOnSave,
    returnToOrigin,
    tags,
    saveByReference,
    dashboardId,
    history,
  }: OnSaveProps & {
    returnToOrigin?: boolean;
    tags?: string[];
    saveByReference: boolean;
    dashboardId?: string | null;
    history: ScopedHistory;
  }) {
    if (!this._attributes) {
      throw new Error('Invalid usage, must await whenReady before calling save');
    }

    const prevTitle = this._attributes.title;
    const prevDescription = this._attributes.description;
    this._attributes.title = newTitle;
    this._attributes.description = newDescription;
    await this._syncAttributesWithStore();

    let mapSerializedState: MapSerializedState | undefined;
    const { attributes, references } = extractReferences({
      attributes: this._attributes,
    });
    if (saveByReference) {
      try {
        const savedObjectsTagging = getSavedObjectsTagging();
        const tagReferences =
          savedObjectsTagging && tags ? savedObjectsTagging.ui.updateTagsReferences([], tags) : [];
        const { id: savedObjectId } = await saveToLibrary(
          attributes,
          [...references, ...tagReferences],
          newCopyOnSave ? undefined : this._mapSerializedState?.savedObjectId
        );
        mapSerializedState = getByReferenceState(this._mapSerializedState, savedObjectId);
      } catch (e) {
        this._attributes.title = prevTitle;
        this._attributes.description = prevDescription;
        getToasts().addDanger({
          title: i18n.translate('xpack.maps.saveToLibraryError', {
            defaultMessage: `An error occurred while saving. Error: {errorMessage}`,
            values: {
              errorMessage: e.message,
            },
          }),
        });
        return;
      }
    } else {
      mapSerializedState = getByValueState(this._mapSerializedState, this._attributes);
    }

    if (tags) {
      this._tags = tags;
    }

    if (returnToOrigin) {
      if (!this._originatingApp) {
        getToasts().addDanger({
          title: i18n.translate('xpack.maps.topNav.saveErrorTitle', {
            defaultMessage: `Error saving ''{title}''`,
            values: { title: newTitle },
          }),
          text: i18n.translate('xpack.maps.topNav.saveErrorText', {
            defaultMessage: 'Unable to return to app without an originating app',
          }),
        });
        return;
      }
      await this._getStateTransfer().navigateToWithEmbeddablePackage(this._originatingApp, {
        state: {
          embeddableId: newCopyOnSave ? undefined : this._embeddableId,
          type: MAP_SAVED_OBJECT_TYPE,
          serializedState: { rawState: mapSerializedState, references },
        },
        path: this._originatingPath,
      });
      return;
    } else if (dashboardId) {
      await this._getStateTransfer().navigateToWithEmbeddablePackage('dashboards', {
        state: {
          type: MAP_SAVED_OBJECT_TYPE,
          serializedState: { rawState: mapSerializedState, references },
        },
        path: dashboardId === 'new' ? '#/create' : `#/view/${dashboardId}`,
      });
      return;
    }

    this._mapSerializedState = mapSerializedState;
    // break connection to originating application
    this._originatingApp = undefined;

    // remove editor state so the connection is still broken after reload
    this._getStateTransfer().clearEditorState(APP_ID);

    getToasts().addSuccess({
      title: i18n.translate('xpack.maps.topNav.saveSuccessMessage', {
        defaultMessage: `Saved ''{title}''`,
        values: { title: newTitle },
      }),
    });

    getCoreChrome().docTitle.change(newTitle);
    this.setBreadcrumbs(history);
    history.push(`/${MAP_PATH}/${this.getSavedObjectId()}${window.location.hash}`);

    if (this._onSaveCallback) {
      this._onSaveCallback();
    }

    return;
  }

  private async _syncAttributesWithStore() {
    const state: MapStoreState = this._store.getState();
    const layerList = getLayerListRaw(state);
    const layerListConfigOnly = copyPersistentState(layerList);
    this._attributes!.layerListJSON = JSON.stringify(layerListConfigOnly);

    const mapSettings = getMapSettings(state);

    this._attributes!.mapStateJSON = JSON.stringify({
      adHocDataViews: await this._getAdHocDataViews(),
      zoom: getMapZoom(state),
      center: getMapCenter(state),
      timeFilters: getTimeFilters(state),
      refreshConfig: {
        isPaused: getTimeFilter().getRefreshInterval().pause,
        interval: getTimeFilter().getRefreshInterval().value,
      },
      query: getQuery(state),
      filters: getFilters(state),
      settings: {
        ...mapSettings,
        // base64 encode custom icons to avoid svg strings breaking saved object stringification/parsing.
        customIcons: mapSettings.customIcons.map((icon) => {
          return { ...icon, svg: Buffer.from(icon.svg).toString('base64') };
        }),
      },
    } as ParsedMapStateJSON);

    this._attributes!.uiStateJSON = JSON.stringify({
      isLayerTOCOpen: getIsLayerTOCOpen(state),
      openTOCDetails: getOpenTOCDetails(state),
    } as ParsedUiStateJSON);
  }

  private async _getAdHocDataViews() {
    const dataViewIds: string[] = [];
    getLayerList(this._store.getState()).forEach((layer) => {
      dataViewIds.push(...layer.getIndexPatternIds());
    });

    const dataViews = await getIndexPatternsFromIds(_.uniq(dataViewIds));
    return dataViews
      .filter((dataView) => {
        return !dataView.isPersisted();
      })
      .map((dataView) => {
        return dataView.toSpec(false);
      });
  }
}
