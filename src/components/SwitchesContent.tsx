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
  SwitchInput, // Giả sử bạn đã định nghĩa một SwitchInput style
} from '../styles/ItemsContentStyles';
import { useInView } from 'react-intersection-observer';

interface Switch {
  id: number;
  name: string;
  state: boolean;
  oldState: string;
  gap: string;
}

const SwitchesContent: React.FC = () => {
  const { content, setContent } = useContent();
  const [searchId, setSearchId] = useState<string>('');
  const [searchName, setSearchName] = useState<string>('');
  const [searchState, setSearchState] = useState<string>('');
  const [searchOldState, setSearchOldState] = useState<string>('');
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

  
  const switches = content.systemData?.switches || []; // Chuỗi các switch
  const switchesState = content.saveData?.switches?._data['@a'] || []; // Trạng thái của các switch
  const switchesStateOrigin = content.originSaveData?.switches?._data['@a'] || []; // Trạng thái của các switch
  const oldSwitchesState = content.oldSaveData?.switches?._data['@a'] || []; // Trạng thái cũ của các switch

  // Tạo mảng Switch với id, name, state, oldState, và gap
  const switchData: Switch[] = switches.map((item: string, index: number) => {
    const state = switchesState[index];
    const oldState = oldSwitchesState[index] ? '1' : oldSwitchesState[index] === false ? '0' : '-';
    const gap = oldSwitchesState[index] != null ? (switchesStateOrigin[index] === oldSwitchesState[index] ? '0' : '1') : '-';

    return {
      id: index,
      name: item,
      state,
      oldState,
      gap
    };
  });

  const handleSwitchChange = useCallback((id: number, state: boolean) => {
    const newState = [...switchesState];
    newState[id] = state;
    const updatedContent = _.set({ ...content }, 'saveData.switches._data.@a', newState);
    setContent(updatedContent);
  }, [switchesState, content, setContent]);

  const filteredSwitches = switchData
    .filter((sw) => {
      const matchesId = sw.id.toString().includes(searchId);
      const matchesName = sw.name != '' && sw.name.toLowerCase().includes(searchName.toLowerCase());
      const matchesState = searchState == '' || (searchState == '1' ? sw.state == true : !sw.state);
      const matchesOldState = sw.oldState?.toString().includes(searchOldState);
      const matchesGap = sw.gap?.toString().includes(searchGap);

      return matchesId && matchesName && matchesState && matchesOldState && matchesGap;
    })
    .sort((a, b) => {
      const aValue = a[sortColumn as keyof Switch];
      const bValue = b[sortColumn as keyof Switch];

      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });

  const handleSort = (column: keyof Switch) => {
    setSortColumn(column as string);
    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
  };

  return (
    <TableContainer>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHeaderCell width='5%'>
              <span onClick={() => handleSort('id')} style={{ cursor: 'pointer' }}>ID</span>
              <SearchInput
                type="text"
                placeholder="Search"
                value={searchId}
                onChange={(e: { target: { value: React.SetStateAction<string>; }; }) => setSearchId(e.target.value)}
              />
            </TableHeaderCell>
            <TableHeaderCell width='30%'>
              <span onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>Name</span>
              <SearchInput
                type="text"
                placeholder="Search"
                value={searchName}
                onChange={(e: { target: { value: React.SetStateAction<string>; }; }) => setSearchName(e.target.value)}
              />
            </TableHeaderCell>
            <TableHeaderCell width='20%'>
              <span onClick={() => handleSort('state')} style={{ cursor: 'pointer' }}>Value</span>
              <SearchInput
                type="text"
                placeholder="Search 0 or 1"
                value={searchState}
                onChange={(e: { target: { value: React.SetStateAction<string>; }; }) => {
                  if (e.target.value != '0' && e.target.value != '1' && e.target.value != '')
                    return
                  setSearchState(e.target.value)
                }}
              />
            </TableHeaderCell>
            <TableHeaderCell width='10%'>
              <span onClick={() => handleSort('oldState')} style={{ cursor: 'pointer' }}>Old Value</span>
              <SearchInput
                type="text"
                placeholder="Search"
                value={searchOldState}
                onChange={(e: { target: { value: React.SetStateAction<string>; }; }) => setSearchOldState(e.target.value)}
              />
            </TableHeaderCell>
            <TableHeaderCell width='10%'>
              <span onClick={() => handleSort('gap')} style={{ cursor: 'pointer' }}>GAP</span>
              <SearchInput
                type="text"
                placeholder="Search"
                value={searchGap}
                onChange={(e: { target: { value: React.SetStateAction<string>; }; }) => setSearchGap(e.target.value)}
              />
            </TableHeaderCell>
          </TableRow>
        </TableHeader>
        <tbody>
          {filteredSwitches.slice(0, visibleItems).map((sw: any, index: number) => (
            <TableRow key={sw.id} ref={index === visibleItems - 1 ? ref : null}>
              <TableCell>{sw.id}</TableCell>
              <TableCell>{sw.name}</TableCell>
              <TableCell>
                <SwitchInput
                  type="checkbox"
                  checked={sw.state}
                  onChange={() => handleSwitchChange(sw.id, !sw.state)}
                />
              </TableCell>
              <TableCell>{sw.oldState}</TableCell>
              <TableCell>{sw.gap}</TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>
    </TableContainer>
  );
};

export default SwitchesContent;
