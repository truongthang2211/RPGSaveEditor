import React, { useCallback, useMemo, useState } from 'react';
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
import { getDifferences } from '../utils/textUtils';
import { useInView } from 'react-intersection-observer';

// Khai báo kiểu dữ liệu cho các mục
interface Item {
  id: string | number;
  name: string;
  quantity: number;
  oldQuantity: number;
  gap: number | string;
}

const VariablesContent: React.FC = () => {
  const { content, setContent } = useContent();
  const [searchId, setSearchId] = useState<string>('');
  const [searchName, setSearchName] = useState<string>('');
  const [searchQuantity, setSearchQuantity] = useState<string>('');
  const [searchOldQuantity, setSearchOldQuantity] = useState<string>('');
  const [searchGap, setSearchGap] = useState<string>('');
  const [sortColumn, setSortColumn] = useState<string>('id');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
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

  // Helper function to normalize variables data (handles both @a array and object formats)
  const normalizeVariablesData = (data: any) => {
    if (Array.isArray(data)) {
      // If it's an array (from @a structure), convert to object
      return data.reduce((acc, val, idx) => {
        acc[idx] = val;
        return acc;
      }, {} as Record<number, any>);
    }
    return data || {};
  };

  const itemsOfPlayerOrigin = normalizeVariablesData(
    content.originSaveData?.variables?._data?.['@a'] || content.originSaveData?.variables?._data
  );
  const itemsOfPlayer = normalizeVariablesData(
    content.saveData?.variables?._data?.['@a'] || content.saveData?.variables?._data
  );
  const itemsOfPlayerOld = normalizeVariablesData(
    content.oldSaveData?.variables?._data?.['@a'] || content.oldSaveData?.variables?._data
  );

  const handleQuantityChange = useCallback((id: number, value: number | string) => {
    const normalizedValue = typeof value === 'string' && !isNaN(Number(value))
      ? Number(value)
      : value;

    const newQuantities = { ...itemsOfPlayer, [id]: normalizedValue };
    // Save to the appropriate location based on current structure
    const variablesData = content.saveData?.variables?._data;
    const path = Array.isArray(variablesData?.['@a']) 
      ? 'saveData.variables._data.@a'
      : 'saveData.variables._data';
    const updatedContent = _.set({ ...content }, path, Array.isArray(variablesData?.['@a']) ? Object.values(newQuantities) : newQuantities);
    setContent(updatedContent);
  }, [itemsOfPlayer, content, setContent]);

  const items: Item[] = useMemo(() => {
    const variables = content?.systemData?.variables || [];
    
    return (variables && variables.length > 0
      ? variables.map((item: string | null, ind: number) => {
          const quantity = itemsOfPlayer[ind] || 0;
          const quantityOrigin = itemsOfPlayerOrigin[ind] || 0;
          const oldQuantity = itemsOfPlayerOld[ind] || 0;
          const gap = Number.isNaN(quantityOrigin - oldQuantity)
            ? getDifferences(quantityOrigin.toString(), oldQuantity.toString())
            : (quantityOrigin - oldQuantity);

          return {
            id: ind,
            name: item || '',
            quantity,
            oldQuantity,
            gap,
          };
        })
      : Object.entries(itemsOfPlayer).map(([key, quantity]) => {
          const ind = Number(key);
          const quantityOrigin = itemsOfPlayerOrigin[ind] || 0;
          const oldQuantity = itemsOfPlayerOld[ind] || 0;
          const gap = Number.isNaN(quantityOrigin - oldQuantity)
            ? getDifferences(quantityOrigin.toString(), oldQuantity.toString())
            : (quantityOrigin - oldQuantity);

          return {
            id: ind,
            name: `Variable#${key}`,
            quantity: quantity || 0,
            oldQuantity,
            gap,
          };
        })
    ).filter((item: Item) => {
      const matchesId = item.id.toString().includes(searchId);
      const matchesName = item.name.toLowerCase().includes(searchName.toLowerCase());
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
  }, [content, itemsOfPlayer, itemsOfPlayerOrigin, itemsOfPlayerOld, searchId, searchName, searchQuantity, searchOldQuantity, searchGap, sortColumn, sortDirection]);

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
                <TableCell className="name-column">{item?.name}</TableCell>
                <TableCell className="quantity-column">
                  <QuantityInput
                    type="text"
                    value={item?.quantity}
                    onChange={(e) => handleQuantityChange(Number(item?.id), e.target.value)}
                  />
                </TableCell>
                <TableCell className="old-quantity-column">{item?.oldQuantity}</TableCell>
                <TableCell className="gap-column">{item?.gap}</TableCell>
              </TableRow>
            );
          })}
        </tbody>
      </Table>
    </TableContainer>
  );
};

export default VariablesContent;
