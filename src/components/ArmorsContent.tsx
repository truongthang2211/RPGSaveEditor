import React, { useCallback, useState } from 'react';
import { useContent } from '../context/ContentContext';
import _ from 'lodash';
import {
  SearchInput,
  TableCell,
  TableContainer,
  TableHeader,
  TableHeaderCell,
  Table,
  TableRow,
  QuantityInput,
} from '../styles/ItemsContentStyles';
import Tooltip from './Tooltip';
import { useInView } from 'react-intersection-observer';

// Khai báo kiểu dữ liệu cho các mục
interface Item {
  id: string | number;
  name: string;
  description?: string;
  quantity: number;
  oldQuantity: number;
  gap: number;
}

const ArmorsContent: React.FC = () => {
  const { content, setContent } = useContent();
  const [searchId, setSearchId] = useState<string>('');
  const [searchName, setSearchName] = useState<string>('');
  const [searchQuantity, setSearchQuantity] = useState<string>('');
  const [searchOldQuantity, setSearchOldQuantity] = useState<string>('');
  const [searchGap, setSearchGap] = useState<string>('');
  const [sortColumn, setSortColumn] = useState<string>('id'); // Cột sắp xếp hiện tại
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc'); // Hướng sắp xếp
  const [visibleItems, setVisibleItems] = useState<number>(500); // Number of items to display initially

  const { ref, inView } = useInView({
    threshold: 0.1, // Trigger earlier
    rootMargin: '100px',
  });
  React.useEffect(() => {
    if (inView) {
      setVisibleItems((prevVisibleItems) => prevVisibleItems + 500);
    }
  }, [inView]);


  const itemsOfPlayerOrigin = content.originSaveData?.party?._armors || {};

  const itemsOfPlayer = content.saveData?.party?._armors || {};
  const itemsOfPlayerOld = content.oldSaveData?.party?._armors || {};

  const handleQuantityChange = useCallback((id: number, value: number) => {
    const newQuantities = { ...itemsOfPlayer, [id]: value };
    const t = _.set({ ...content }, 'saveData.party._armors', newQuantities);
    setContent(t);
  }, [itemsOfPlayer, content, setContent]);

  // Tính toán giá trị `quantity`, `oldQuantity`, và `gap` trước khi sắp xếp
  const items: Item[] = (content.armorsData || []).map((item: { id: string | number; name: string; }) => {
    const quantity = itemsOfPlayer[item?.id] || 0;
    const quantityOrigin = itemsOfPlayerOrigin[item?.id] || 0;
    const oldQuantity = itemsOfPlayerOld[item?.id] || 0;
    const gap = quantityOrigin - oldQuantity;

    return {
      ...item,
      quantity,
      oldQuantity,
      gap
    };
  }).filter((item: Item) => {
    const matchesId = item?.id?.toString().includes(searchId);
    const matchesName = item?.name?.toLowerCase().includes(searchName.toLowerCase());
    const matchesQuantity = item.quantity.toString().includes(searchQuantity);
    const matchesOldQuantity = item.oldQuantity.toString().includes(searchOldQuantity);
    const matchesGap = item.gap.toString().includes(searchGap);

    return matchesId && matchesName && matchesQuantity && matchesOldQuantity && matchesGap && item?.name?.trim();
  }).sort((a: { [x: string]: any; }, b: { [x: string]: any; }) => {
    const aValue = a[sortColumn as keyof Item];
    const bValue = b[sortColumn as keyof Item];

    if (sortDirection === 'asc') {
      return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
    } else {
      return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
    }
  });

  const handleSort = (column: keyof Item) => {
    setSortColumn(column as string);
    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
  };

  return (
    <TableContainer>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHeaderCell width='5%' className="id-column">
              <span
                onClick={() => handleSort('id')} style={{ cursor: 'pointer' }}
              >
                ID
              </span>
              <SearchInput
                type="text"
                placeholder="Search"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
              />
            </TableHeaderCell>
            <TableHeaderCell width='30%' className="name-column">
              <span
                onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}
              >
                Name
              </span>
              <SearchInput
                type="text"
                placeholder="Search"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
              />
            </TableHeaderCell>
            <TableHeaderCell width='20%' className="quantity-column">
              <span
                onClick={() => handleSort('quantity')} style={{ cursor: 'pointer' }}
              >
                Quantity
              </span>
              <SearchInput
                type="text"
                placeholder="Search"
                value={searchQuantity}
                onChange={(e) => setSearchQuantity(e.target.value)}
              />
            </TableHeaderCell>
            <TableHeaderCell width='10%' className="old-quantity-column">
              <span
                onClick={() => handleSort('oldQuantity')} style={{ cursor: 'pointer' }}
              >
                Old Qty
              </span>
              <SearchInput
                type="text"
                placeholder="Search"
                value={searchOldQuantity}
                onChange={(e) => setSearchOldQuantity(e.target.value)}
              />
            </TableHeaderCell>
            <TableHeaderCell width='10%' className="gap-column">
              <span
                onClick={() => handleSort('gap')} style={{ cursor: 'pointer' }}
              >
                GAP
              </span>
              <SearchInput
                type="text"
                placeholder="Search"
                value={searchGap}
                onChange={(e) => setSearchGap(e.target.value)}
              />
            </TableHeaderCell>
          </TableRow>
        </TableHeader>
        <tbody>
          {items.slice(0, visibleItems).map((item: Item, index: number) => {
            return (
              <TableRow key={item?.id} ref={index === visibleItems - 1 ? ref : null}>
                <TableCell className="id-column">{item?.id}</TableCell>
                <TableCell className="name-column">
                  <Tooltip text={item?.description} placement={index === items.length - 1 ? 'top' : 'right'}>
                    {item?.name}
                  </Tooltip>
                </TableCell>
                <TableCell className="quantity-column">
                  <QuantityInput
                    type="number"
                    min="0"
                    value={item.quantity}
                    onChange={(e) => handleQuantityChange(Number(item?.id), Number(e.target.value))}
                  />
                </TableCell>
                <TableCell className="old-quantity-column">{item.oldQuantity}</TableCell>
                <TableCell className="gap-column">{item.gap}</TableCell>
              </TableRow>
            );
          })}
        </tbody>
      </Table>
    </TableContainer>
  );
};

export default ArmorsContent;
