/*
* Licensed to the Apache Software Foundation (ASF) under one
* or more contributor license agreements.  See the NOTICE file
* distributed with this work for additional information
* regarding copyright ownership.  The ASF licenses this file
* to you under the Apache License, Version 2.0 (the
* "License"); you may not use this file except in compliance
* with the License.  You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing,
* software distributed under the License is distributed on an
* "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
* KIND, either express or implied.  See the License for the
* specific language governing permissions and limitations
* under the License.
*/

import createSeriesDataSimply from '../helper/createSeriesDataSimply';
import * as zrUtil from 'zrender/src/core/util';
import * as modelUtil from '../../util/model';
import { getPercentSeats } from '../../util/number';
import { makeSeriesEncodeForNameBased } from '../../data/helper/sourceHelper';
import LegendVisualProvider from '../../visual/LegendVisualProvider';
import SeriesModel from '../../model/Series';
import {
    SeriesOption,
    CallbackDataParams,
    CircleLayoutOptionMixin,
    LabelLineOption,
    ItemStyleOption,
    BoxLayoutOptionMixin,
    OptionDataValueNumeric,
    SeriesEncodeOptionMixin,
    OptionDataItemObject,
    StatesOptionMixin,
    SeriesLabelOption,
    DefaultEmphasisFocus
} from '../../util/types';
import type SeriesData from '../../data/SeriesData';
import { registerLayOutOnCoordSysUsage } from '../../core/CoordinateSystem';

interface PieItemStyleOption<TCbParams = never> extends ItemStyleOption<TCbParams> {
    // can be 10
    // which means that both innerCornerRadius and outerCornerRadius are 10
    // can also be an array [20, 10]
    // which means that innerCornerRadius is 20
    // and outerCornerRadius is 10
    // can also be a string or string array, such as ['20%', '50%']
    // which means that innerCornerRadius is 20% of the innerRadius
    // and outerCornerRadius is half of outerRadius.
    borderRadius?: (number | string)[] | number | string
}

export interface PieCallbackDataParams extends CallbackDataParams {
    percent: number
}

export interface PieStateOption<TCbParams = never> {
    // TODO: TYPE Color Callback
    itemStyle?: PieItemStyleOption<TCbParams>
    label?: PieLabelOption
    labelLine?: PieLabelLineOption
}
interface PieLabelOption extends Omit<SeriesLabelOption, 'rotate' | 'position'> {
    rotate?: number | boolean | 'radial' | 'tangential'
    alignTo?: 'none' | 'labelLine' | 'edge'
    edgeDistance?: string | number
    /**
     * @deprecated Use `edgeDistance` instead
     */
    margin?: string | number
    bleedMargin?: number
    distanceToLabelLine?: number

    position?: SeriesLabelOption['position'] | 'outer' | 'inner' | 'center' | 'outside'
}

interface PieLabelLineOption extends LabelLineOption {
    /**
     * Max angle between labelLine and surface normal.
     * 0 - 180
     */
    maxSurfaceAngle?: number
}

interface ExtraStateOption {
    emphasis?: {
        focus?: DefaultEmphasisFocus
        scale?: boolean
        scaleSize?: number
    }
}

export interface PieDataItemOption extends
    OptionDataItemObject<OptionDataValueNumeric>,
    PieStateOption, StatesOptionMixin<PieStateOption, ExtraStateOption> {
    cursor?: string
}
export interface PieSeriesOption extends
    Omit<SeriesOption<PieStateOption<PieCallbackDataParams>, ExtraStateOption>, 'labelLine'>,
    PieStateOption<PieCallbackDataParams>,
    CircleLayoutOptionMixin<{centerExtra: string | number}>,
    BoxLayoutOptionMixin,
    SeriesEncodeOptionMixin {

    type?: 'pie'

    roseType?: 'radius' | 'area'

    clockwise?: boolean
    startAngle?: number
    endAngle?: number | 'auto'
    padAngle?: number;

    minAngle?: number
    minShowLabelAngle?: number

    selectedOffset?: number

    avoidLabelOverlap?: boolean
    percentPrecision?: number

    stillShowZeroSum?: boolean

    animationType?: 'expansion' | 'scale'
    animationTypeUpdate?: 'transition' | 'expansion'

    showEmptyCircle?: boolean;
    emptyCircleStyle?: PieItemStyleOption;

    data?: (OptionDataValueNumeric | OptionDataValueNumeric[] | PieDataItemOption)[]
}

const innerData = modelUtil.makeInner<{
    seats?: number[]
}, SeriesData>();

class PieSeriesModel extends SeriesModel<PieSeriesOption> {

    static type = 'series.pie' as const;

    /**
     * @overwrite
     */
    init(option: PieSeriesOption): void {
        super.init.apply(this, arguments as any);

        // Enable legend selection for each data item
        // Use a function instead of direct access because data reference may changed
        this.legendVisualProvider = new LegendVisualProvider(
            zrUtil.bind(this.getData, this), zrUtil.bind(this.getRawData, this)
        );

        this._defaultLabelLine(option);
    }

    /**
     * @overwrite
     */
    mergeOption(): void {
        super.mergeOption.apply(this, arguments as any);
    }

    /**
     * @overwrite
     */
    getInitialData(this: PieSeriesModel): SeriesData {
        return createSeriesDataSimply(this, {
            coordDimensions: ['value'],
            encodeDefaulter: zrUtil.curry(makeSeriesEncodeForNameBased, this)
        });
    }

    /**
     * @overwrite
     */
    getDataParams(dataIndex: number): PieCallbackDataParams {
        const data = this.getData();
        // update seats when data is changed
        const dataInner = innerData(data);
        let seats = dataInner.seats;
        if (!seats) {
            const valueList: number[] = [];
            data.each(data.mapDimension('value'), function (value: number) {
                valueList.push(value);
            });
            seats = dataInner.seats = getPercentSeats(valueList, data.hostModel.get('percentPrecision'));
        }
        const params = super.getDataParams(dataIndex) as PieCallbackDataParams;
        // seats may be empty when sum is 0
        params.percent = seats[dataIndex] || 0;
        params.$vars.push('percent');
        return params;
    }

    private _defaultLabelLine(option: PieSeriesOption): void {
        // Extend labelLine emphasis
        modelUtil.defaultEmphasis(option, 'labelLine', ['show']);

        const labelLineNormalOpt = option.labelLine;
        const labelLineEmphasisOpt = option.emphasis.labelLine;
        // Not show label line if `label.normal.show = false`
        labelLineNormalOpt.show = labelLineNormalOpt.show
            && option.label.show;
        labelLineEmphasisOpt.show = labelLineEmphasisOpt.show
            && option.emphasis.label.show;
    }

    static defaultOption: Omit<PieSeriesOption, 'type'> = {
        // zlevel: 0,
        z: 2,
        legendHoverLink: true,
        colorBy: 'data',
        // 默认全局居中
        center: ['50%', '50%'],
        radius: [0, '50%'],
        // 默认顺时针
        clockwise: true,
        startAngle: 90,
        endAngle: 'auto',
        padAngle: 0,
        // 最小角度改为0
        minAngle: 0,

        // If the angle of a sector less than `minShowLabelAngle`,
        // the label will not be displayed.
        minShowLabelAngle: 0,

        // 选中时扇区偏移量
        selectedOffset: 10,

        // 选择模式，默认关闭，可选single，multiple
        // selectedMode: false,
        // 南丁格尔玫瑰图模式，'radius'（半径） | 'area'（面积）
        // roseType: null,

        percentPrecision: 2,

        // If still show when all data zero.
        stillShowZeroSum: true,

        // cursor: null,
        coordinateSystemUsage: 'box',

        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: null,
        height: null,

        label: {
            // color: 'inherit',
            // If rotate around circle
            rotate: 0,
            show: true,
            overflow: 'truncate',
            // 'outer', 'inside', 'center'
            position: 'outer',
            // 'none', 'labelLine', 'edge'. Works only when position is 'outer'
            alignTo: 'none',
            // Closest distance between label and chart edge.
            // Works only position is 'outer' and alignTo is 'edge'.
            edgeDistance: '25%',
            // Works only position is 'outer' and alignTo is not 'edge'.
            // The default `bleedMargin` is auto determined according to view rect size.
            // bleedMargin: 10,
            // Distance between text and label line.
            distanceToLabelLine: 5
            // formatter: 标签文本格式器，同 tooltip.formatter，不支持异步回调
            // 默认使用全局文本样式，详见 textStyle
            // distance: 当position为inner时有效，为label位置到圆心的距离与圆半径(环状图为内外半径和)的比例系数
        },
        // Enabled when label.normal.position is 'outer'
        labelLine: {
            show: true,
            // 引导线两段中的第一段长度
            length: 15,
            // 引导线两段中的第二段长度
            length2: 30,
            smooth: false,
            minTurnAngle: 90,
            maxSurfaceAngle: 90,
            lineStyle: {
                // color: 各异,
                width: 1,
                type: 'solid'
            }
        },
        itemStyle: {
            borderWidth: 1,
            borderJoin: 'round'
        },

        showEmptyCircle: true,
        emptyCircleStyle: {
            color: 'lightgray',
            opacity: 1
        },

        labelLayout: {
            // Hide the overlapped label.
            hideOverlap: true
        },

        emphasis: {
            scale: true,
            scaleSize: 5
        },

        // If use strategy to avoid label overlapping
        avoidLabelOverlap: true,

        // Animation type. Valid values: expansion, scale
        animationType: 'expansion',

        animationDuration: 1000,

        // Animation type when update. Valid values: transition, expansion
        animationTypeUpdate: 'transition',

        animationEasingUpdate: 'cubicInOut',
        animationDurationUpdate: 500,
        animationEasing: 'cubicInOut'
    };

}

registerLayOutOnCoordSysUsage({
    fullType: PieSeriesModel.type,
    getCoord2(model: PieSeriesModel) {
        // Not able to validate `center` type here.
        // But percentage center, such as '12%', is not allowed in this case.
        return model.getShallow('center');
    }
});

export default PieSeriesModel;
